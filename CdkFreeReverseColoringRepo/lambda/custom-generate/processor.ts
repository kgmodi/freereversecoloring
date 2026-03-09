/**
 * frc-custom-generate-processor
 *
 * Async processor Lambda invoked by the initiator handler.
 * Performs the actual OpenAI generation work:
 *   1. Update DynamoDB status to "processing"
 *   2. Call GPT-4o for structured design description
 *   3. Call gpt-image-1 for watercolor image
 *   4. Upload image to S3
 *   5. Update DynamoDB with result data + status "complete"
 *
 * On error, marks the DynamoDB record as "failed" with an error message.
 *
 * This Lambda is invoked asynchronously (InvocationType: 'Event') and
 * has a 5-minute timeout to accommodate OpenAI generation times.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcessorEvent {
  generationId: string;
  email: string;
  prompt: string;
  monthKey: string;
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

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function handler(event: ProcessorEvent): Promise<void> {
  const { generationId, email, prompt, monthKey } = event;

  console.log(
    `[processor] Starting generation ${generationId} for ${maskEmail(email)}`,
  );

  try {
    // -----------------------------------------------------------------------
    // Step 1: Update status to "processing"
    // -----------------------------------------------------------------------
    await dynamoClient.send(
      new UpdateCommand({
        TableName: CUSTOM_GENERATIONS_TABLE,
        Key: { generationId },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'processing' },
      }),
    );

    // -----------------------------------------------------------------------
    // Step 2: Generate design description with GPT-4o
    // -----------------------------------------------------------------------
    console.log('[processor] Generating design description...');
    const design = await generateCustomDesignDescription(prompt);

    // -----------------------------------------------------------------------
    // Step 3: Generate watercolor image with gpt-image-1
    // -----------------------------------------------------------------------
    console.log(`[processor] Generating image for "${design.title}"...`);
    const imageBuffer = await generateImage(design.generationPrompt);
    console.log(`[processor] Image generated: ${imageBuffer.length} bytes`);

    // -----------------------------------------------------------------------
    // Step 4: Upload image to S3
    // -----------------------------------------------------------------------
    const s3Key = `custom-generations/${monthKey}/${generationId}/${design.slug}.png`;

    console.log(`[processor] Uploading to s3://${CONTENT_BUCKET}/${s3Key}`);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: CONTENT_BUCKET,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    // -----------------------------------------------------------------------
    // Step 5: Compute remaining generations for this email
    // -----------------------------------------------------------------------
    // We stored the pending record already, so usage is already incremented.
    // The initiator returned the remaining count; we store it again here for
    // the status endpoint to surface without a GSI query.
    const remainingGenerations = Math.max(0, MAX_FREE_PER_MONTH - 1);
    // Note: This is approximate. For exact count, the status endpoint would
    // need to re-query the GSI. Keeping it simple for now.

    // -----------------------------------------------------------------------
    // Step 6: Update DynamoDB with result + status "complete"
    // -----------------------------------------------------------------------
    const completedAt = new Date().toISOString();

    await dynamoClient.send(
      new UpdateCommand({
        TableName: CUSTOM_GENERATIONS_TABLE,
        Key: { generationId },
        UpdateExpression: `
          SET #status = :status,
              completedAt = :completedAt,
              title = :title,
              slug = :slug,
              description = :description,
              difficulty = :difficulty,
              s3Key = :s3Key,
              colorPalette = :colorPalette,
              drawingPrompts = :drawingPrompts,
              tags = :tags,
              fileSizeBytes = :fileSizeBytes,
              remainingGenerations = :remainingGenerations
        `,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'complete',
          ':completedAt': completedAt,
          ':title': design.title,
          ':slug': design.slug,
          ':description': design.description,
          ':difficulty': design.difficulty,
          ':s3Key': s3Key,
          ':colorPalette': design.colorPalette,
          ':drawingPrompts': design.drawingPrompts,
          ':tags': design.tags,
          ':fileSizeBytes': imageBuffer.length,
          ':remainingGenerations': remainingGenerations,
        },
      }),
    );

    console.log(
      `[processor] Complete! "${design.title}" for ${maskEmail(email)}`,
    );
  } catch (err) {
    const errorMsg = (err as Error).message || 'Unknown error';
    console.error(`[processor] Failed for ${generationId}: ${errorMsg}`, err);

    // Mark the record as failed so the status endpoint can inform the user
    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: CUSTOM_GENERATIONS_TABLE,
          Key: { generationId },
          UpdateExpression: 'SET #status = :status, errorMessage = :errorMessage',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'failed',
            ':errorMessage': 'Something went wrong generating your page. Please try again.',
          },
        }),
      );
    } catch (updateErr) {
      console.error(`[processor] Failed to update status to "failed": ${(updateErr as Error).message}`);
    }

    // Re-throw so the Lambda runtime records the error in CloudWatch metrics
    throw err;
  }
}
