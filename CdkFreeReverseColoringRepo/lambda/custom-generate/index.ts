/**
 * frc-custom-generate-handler
 *
 * Handles two operations for the Custom Reverse Coloring Page Generator:
 *
 *   POST /api/custom-generate          → Initiate generation
 *     1. Validate email + prompt
 *     2. Check rate limit (2 free per email per month) with atomic re-check
 *     3. Write "pending" record to DynamoDB
 *     4. Async-invoke the processor Lambda
 *     5. Return 202 with { generationId, status: "pending" }
 *
 *   GET  /api/custom-generate/{id}     → Poll generation status
 *     Returns current status + result data (including fresh presigned URL) when complete.
 *
 * This two-step async pattern avoids the API Gateway 29-second integration
 * timeout limit, since actual image generation takes 30-60 seconds.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// AWS SDK Clients
// ---------------------------------------------------------------------------

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const s3Client = new S3Client({ region: 'us-east-1' });
const lambdaClient = new LambdaClient({ region: 'us-east-1' });

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const CUSTOM_GENERATIONS_TABLE = process.env.CUSTOM_GENERATIONS_TABLE!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const MAX_FREE_PER_MONTH = parseInt(process.env.MAX_FREE_PER_MONTH || '2', 10);
const PROCESSOR_FUNCTION_NAME = process.env.PROCESSOR_FUNCTION_NAME!;
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
  pathParameters?: Record<string, string | undefined> | null;
}

interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length <= 2
    ? local[0] + '***'
    : local[0] + '***' + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
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
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
// Rate limit check (via GSI query)
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
// POST handler — Initiate generation
// ---------------------------------------------------------------------------

async function handleInitiate(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return errorResponse(400, 'Please enter a valid email address', origin);
  }

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
      `[custom-generate] Email: ${maskEmail(email)}, month: ${monthKey}, usage: ${usageCount}/${MAX_FREE_PER_MONTH}`,
    );

    if (usageCount >= MAX_FREE_PER_MONTH) {
      return errorResponse(429, 'rate_limit', origin, {
        message: `You've used your ${MAX_FREE_PER_MONTH} free generations this month. Check back next month!`,
        remainingGenerations: 0,
        nextResetDate: getNextMonthResetDate(),
      });
    }

    // -----------------------------------------------------------------------
    // Step 2: Write "pending" record to DynamoDB
    // -----------------------------------------------------------------------
    const generationId = `custom-${randomUUID()}`;
    const now = new Date().toISOString();

    await dynamoClient.send(
      new PutCommand({
        TableName: CUSTOM_GENERATIONS_TABLE,
        Item: {
          generationId,
          email,
          monthKey,
          prompt,
          status: 'pending',
          createdAt: now,
        },
      }),
    );

    // -----------------------------------------------------------------------
    // Step 2b: Re-check rate limit to guard against concurrent requests
    // (mitigates TOCTOU race condition — see review feedback)
    // -----------------------------------------------------------------------
    const updatedCount = await getMonthlyUsageCount(email, monthKey);
    if (updatedCount > MAX_FREE_PER_MONTH) {
      console.log(
        `[custom-generate] Race condition detected for ${maskEmail(email)}: count=${updatedCount}, rolling back`,
      );
      await dynamoClient.send(
        new DeleteCommand({
          TableName: CUSTOM_GENERATIONS_TABLE,
          Key: { generationId },
        }),
      );
      return errorResponse(429, 'rate_limit', origin, {
        message: `You've used your ${MAX_FREE_PER_MONTH} free generations this month. Check back next month!`,
        remainingGenerations: 0,
        nextResetDate: getNextMonthResetDate(),
      });
    }

    // -----------------------------------------------------------------------
    // Step 3: Async-invoke the processor Lambda
    // -----------------------------------------------------------------------
    console.log(`[custom-generate] Invoking processor for ${generationId}`);
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: PROCESSOR_FUNCTION_NAME,
        InvocationType: 'Event', // async invocation — returns immediately
        Payload: JSON.stringify({
          generationId,
          email,
          prompt,
          monthKey,
        }),
      }),
    );

    const remainingGenerations = MAX_FREE_PER_MONTH - updatedCount;

    // -----------------------------------------------------------------------
    // Step 4: Return 202 Accepted with generation ID
    // -----------------------------------------------------------------------
    return {
      statusCode: 202,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        generationId,
        status: 'pending',
        remainingGenerations,
      }),
    };
  } catch (err) {
    const errorMsg = `Custom generation initiation failed: ${(err as Error).message}`;
    console.error(`[custom-generate] ${errorMsg}`, err);
    return errorResponse(500, 'Something went wrong. Please try again.', origin);
  }
}

// ---------------------------------------------------------------------------
// GET handler — Poll generation status
// ---------------------------------------------------------------------------

async function handleStatus(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;
  const generationId = event.pathParameters?.generationId;

  if (!generationId) {
    return errorResponse(400, 'Missing generationId', origin);
  }

  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: CUSTOM_GENERATIONS_TABLE,
        Key: { generationId },
      }),
    );

    if (!result.Item) {
      return errorResponse(404, 'Generation not found', origin);
    }

    const item = result.Item;
    const response: Record<string, unknown> = {
      generationId: item.generationId,
      status: item.status,
    };

    if (item.status === 'complete') {
      // Generate a fresh presigned URL (7-day expiry)
      const imageUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: CONTENT_BUCKET,
          Key: item.s3Key,
        }),
        { expiresIn: 604800 },
      );

      response.imageUrl = imageUrl;
      response.title = item.title;
      response.description = item.description;
      response.difficulty = item.difficulty;
      response.drawingPrompts = item.drawingPrompts;
      response.colorPalette = item.colorPalette;
      response.tags = item.tags;
      response.remainingGenerations = item.remainingGenerations;
    }

    if (item.status === 'failed') {
      response.errorMessage = item.errorMessage || 'Generation failed. Please try again.';
    }

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify(response),
    };
  } catch (err) {
    const errorMsg = `Status check failed: ${(err as Error).message}`;
    console.error(`[custom-generate] ${errorMsg}`, err);
    return errorResponse(500, 'Something went wrong checking your generation status.', origin);
  }
}

// ---------------------------------------------------------------------------
// Main Handler (routes by HTTP method)
// ---------------------------------------------------------------------------

export async function handler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  console.log('[custom-generate] Invoked:', JSON.stringify({
    method: event.httpMethod,
    path: event.pathParameters,
    bodyLength: event.body?.length,
  }));

  // NOTE: CORS preflight OPTIONS requests are handled automatically by
  // API Gateway's defaultCorsPreflightOptions — no Lambda handling needed.

  if (event.httpMethod === 'POST') {
    return handleInitiate(event);
  }

  if (event.httpMethod === 'GET') {
    return handleStatus(event);
  }

  const origin = event.headers?.origin || event.headers?.Origin;
  return errorResponse(405, 'Method not allowed', origin);
}
