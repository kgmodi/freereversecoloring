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
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
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

const sesClient = new SESv2Client({ region: 'us-east-1' });

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const CUSTOM_GENERATIONS_TABLE = process.env.CUSTOM_GENERATIONS_TABLE!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const MAX_FREE_PER_MONTH = parseInt(process.env.MAX_FREE_PER_MONTH || '2', 10);
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@freereversecoloring.com';
const SITE_URL = process.env.SITE_URL || 'https://freereversecoloring.com';

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
// Email Template
// ---------------------------------------------------------------------------

function buildGenerationNotificationEmail(params: {
  title: string;
  description: string;
  shareUrl: string;
  drawingPrompts: string[];
}): { html: string; text: string } {
  const promptsHtml = params.drawingPrompts
    .map((p, i) => `<li style="margin-bottom: 8px; color: #4A3F6B;">${i + 1}. ${p}</li>`)
    .join('');
  const promptsText = params.drawingPrompts
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #6B46C1; font-size: 24px; margin-bottom: 4px;">FreeReverseColoring</h1>
  <p style="color: #6B687D; margin-top: 0;">Your custom reverse coloring page is ready!</p>

  <div style="background-color: #F8F6FF; border-radius: 12px; padding: 24px; margin: 24px 0;">
    <h2 style="color: #2D2B3D; font-size: 20px; margin-top: 0;">${params.title}</h2>
    <p style="color: #6B687D;">${params.description}</p>
  </div>

  <div style="margin: 24px 0;">
    <h3 style="color: #4A3F6B; font-size: 16px;">Drawing Ideas</h3>
    <ul style="padding-left: 0; list-style: none;">${promptsHtml}</ul>
  </div>

  <div style="text-align: center; margin: 32px 0;">
    <a href="${params.shareUrl}" style="background-color: #F4845F; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">View &amp; Download Your Design</a>
  </div>

  <div style="text-align: center; margin: 24px 0;">
    <p style="color: #6B687D; font-size: 14px;">Share your creation with friends!</p>
    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this reverse coloring page I created!')}&url=${encodeURIComponent(params.shareUrl)}" style="color: #6B46C1; margin: 0 8px;">Twitter</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(params.shareUrl)}" style="color: #6B46C1; margin: 0 8px;">Facebook</a>
    <a href="https://pinterest.com/pin/create/button/?url=${encodeURIComponent(params.shareUrl)}&description=${encodeURIComponent(params.title)}" style="color: #6B46C1; margin: 0 8px;">Pinterest</a>
  </div>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <div style="text-align: center;">
    <p style="color: #6B687D; font-size: 14px;">Want more designs? We publish 3 new watercolor backgrounds every Wednesday.</p>
    <a href="${SITE_URL}/#signup" style="color: #6B46C1; font-weight: 600;">Subscribe for Free</a>
  </div>

  <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px;">
    &copy; FreeReverseColoring &mdash; <a href="${SITE_URL}" style="color: #6B46C1;">${SITE_URL}</a>
  </p>
</body>
</html>`.trim();

  const text = `Your reverse coloring page "${params.title}" is ready!

${params.description}

Drawing Ideas:
${promptsText}

View & Download: ${params.shareUrl}

Share with friends:
- Twitter: https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this reverse coloring page I created!')}&url=${encodeURIComponent(params.shareUrl)}
- Facebook: https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(params.shareUrl)}

Want more designs? Subscribe at ${SITE_URL}/#signup

FreeReverseColoring - ${SITE_URL}`;

  return { html, text };
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

    // -----------------------------------------------------------------------
    // Step 7: Send email notification to the user
    // -----------------------------------------------------------------------
    try {
      const shareUrl = `${SITE_URL}/shared/?id=${generationId}`;
      const { html, text } = buildGenerationNotificationEmail({
        title: design.title,
        description: design.description,
        shareUrl,
        drawingPrompts: design.drawingPrompts,
      });

      await sesClient.send(
        new SendEmailCommand({
          FromEmailAddress: SES_FROM_EMAIL,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: {
                Data: `Your reverse coloring page "${design.title}" is ready!`,
                Charset: 'UTF-8',
              },
              Body: {
                Html: { Data: html, Charset: 'UTF-8' },
                Text: { Data: text, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
      console.log(`[processor] Notification email sent to ${maskEmail(email)}`);
    } catch (emailErr) {
      // Log but don't fail the generation if email fails
      console.error(`[processor] Failed to send notification email to ${maskEmail(email)}: ${(emailErr as Error).message}`);
    }

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
