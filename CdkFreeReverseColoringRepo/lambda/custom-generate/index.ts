/**
 * frc-custom-generate-handler
 *
 * Custom Reverse Coloring Page Generator — lets users create a one-off
 * AI-generated watercolor reverse coloring page from a text prompt.
 *
 * Flow:
 *   1. Validate email + prompt
 *   2. Check rate limit (2 free generations per email per month)
 *   3. Call GPT-4o for design description (structured JSON)
 *   4. Call gpt-image-1 for watercolor image
 *   5. Upload image to S3
 *   6. Record generation in DynamoDB
 *   7. Return presigned URL + design metadata
 *
 * Input (API Gateway proxy): POST /api/custom-generate
 *   Body: { email: string, prompt: string }
 *
 * Output: API Gateway proxy response with:
 *   { imageUrl, title, description, drawingPrompts, colorPalette, remainingGenerations }
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  generateCustomDesignDescription,
  generateImage,
} from './openai-client';

// ---------------------------------------------------------------------------
// AWS SDK Clients
// ---------------------------------------------------------------------------

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const s3Client = new S3Client({ region: 'us-east-1' });

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const CUSTOM_GENERATIONS_TABLE = process.env.CUSTOM_GENERATIONS_TABLE!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const MAX_FREE_PER_MONTH = parseInt(process.env.MAX_FREE_PER_MONTH || '2', 10);
const ALLOWED_ORIGINS = [
  'https://freereversecoloring.com',
  'https://www.freereversecoloring.com',
  'http://localhost:3000',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface APIGatewayEvent {
  httpMethod: string;
  body: string | null;
  headers: Record<string, string | undefined>;
}

interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getNextMonthResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return nextMonth.toISOString().split('T')[0];
}

function corsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function errorResponse(
  statusCode: number,
  message: string,
  origin?: string,
  extra?: Record<string, unknown>,
): APIGatewayResponse {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify({ error: message, ...extra }),
  };
}

// ---------------------------------------------------------------------------
// Rate limit check
// ---------------------------------------------------------------------------

async function getMonthlyUsageCount(email: string, monthKey: string): Promise<number> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: CUSTOM_GENERATIONS_TABLE,
      IndexName: 'EmailMonthIndex',
      KeyConditionExpression: 'email = :email AND monthKey = :month',
      ExpressionAttributeValues: {
        ':email': email.toLowerCase(),
        ':month': monthKey,
      },
      Select: 'COUNT',
    }),
  );
  return result.Count ?? 0;
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function handler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  console.log('[custom-generate] Invoked:', JSON.stringify({
    method: event.httpMethod,
    bodyLength: event.body?.length,
  }));

  const origin = event.headers?.origin || event.headers?.Origin;

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', origin);
  }

  // Parse request body
  let body: { email?: string; prompt?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Invalid JSON body', origin);
  }

  const email = body.email?.trim().toLowerCase();
  const prompt = body.prompt?.trim();

  // -------------------------------------------------------------------------
  // Validate inputs
  // -------------------------------------------------------------------------

  if (!email || !prompt) {
    return errorResponse(400, 'Both email and prompt are required', origin);
  }

  // Email validation (same regex as subscribe handler)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return errorResponse(400, 'Please enter a valid email address', origin);
  }

  // Prompt length validation
  if (prompt.length < 3) {
    return errorResponse(400, 'Please describe your theme in at least a few words', origin);
  }

  if (prompt.length > 500) {
    return errorResponse(400, 'Please keep your theme description under 500 characters', origin);
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Check rate limit
    // -----------------------------------------------------------------------
    const monthKey = getCurrentMonthKey();
    const usageCount = await getMonthlyUsageCount(email, monthKey);

    console.log(
      `[custom-generate] Email: ${email}, month: ${monthKey}, usage: ${usageCount}/${MAX_FREE_PER_MONTH}`,
    );

    if (usageCount >= MAX_FREE_PER_MONTH) {
      return errorResponse(429, 'rate_limit', origin, {
        message: `You've used your ${MAX_FREE_PER_MONTH} free generations this month. Check back next month!`,
        remainingGenerations: 0,
        nextResetDate: getNextMonthResetDate(),
      });
    }

    // -----------------------------------------------------------------------
    // Step 2: Generate design description with GPT-4o
    // -----------------------------------------------------------------------
    console.log('[custom-generate] Generating design description...');
    const design = await generateCustomDesignDescription(prompt);

    // -----------------------------------------------------------------------
    // Step 3: Generate watercolor image with gpt-image-1
    // -----------------------------------------------------------------------
    console.log(`[custom-generate] Generating image for "${design.title}"...`);
    const imageBuffer = await generateImage(design.generationPrompt);
    console.log(`[custom-generate] Image generated: ${imageBuffer.length} bytes`);

    // -----------------------------------------------------------------------
    // Step 4: Upload image to S3
    // -----------------------------------------------------------------------
    const generationId = `custom-${generateId()}`;
    const s3Key = `custom-generations/${monthKey}/${generationId}/${design.slug}.png`;

    console.log(`[custom-generate] Uploading to s3://${CONTENT_BUCKET}/${s3Key}`);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: CONTENT_BUCKET,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    // Generate presigned URL (7 days expiry)
    const imageUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: CONTENT_BUCKET,
        Key: s3Key,
      }),
      { expiresIn: 604800 },
    );

    // -----------------------------------------------------------------------
    // Step 5: Record generation in DynamoDB
    // -----------------------------------------------------------------------
    const now = new Date().toISOString();
    await dynamoClient.send(
      new PutCommand({
        TableName: CUSTOM_GENERATIONS_TABLE,
        Item: {
          generationId,
          email,
          monthKey,
          generatedAt: now,
          prompt,
          title: design.title,
          slug: design.slug,
          description: design.description,
          difficulty: design.difficulty,
          s3Key,
          colorPalette: design.colorPalette,
          drawingPrompts: design.drawingPrompts,
          tags: design.tags,
          fileSizeBytes: imageBuffer.length,
        },
      }),
    );

    const remainingGenerations = MAX_FREE_PER_MONTH - usageCount - 1;

    console.log(
      `[custom-generate] Success! "${design.title}" for ${email}. Remaining: ${remainingGenerations}`,
    );

    // -----------------------------------------------------------------------
    // Step 6: Return result
    // -----------------------------------------------------------------------
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        generationId,
        imageUrl,
        title: design.title,
        description: design.description,
        difficulty: design.difficulty,
        drawingPrompts: design.drawingPrompts,
        colorPalette: design.colorPalette,
        tags: design.tags,
        remainingGenerations,
      }),
    };
  } catch (err) {
    const errorMsg = `Custom generation failed: ${(err as Error).message}`;
    console.error(`[custom-generate] ${errorMsg}`, err);

    return errorResponse(500, 'Something went wrong generating your page. Please try again.', origin);
  }
}
