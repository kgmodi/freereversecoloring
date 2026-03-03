/**
 * frc-generate-content-handler
 *
 * Generates 3 reverse coloring designs for a given week:
 *   1. Picks an available theme from DynamoDB (or uses a provided themeId)
 *   2. Calls GPT-4o to generate 3 design descriptions (structured JSON)
 *   3. Calls gpt-image-1 to generate 3 watercolor images
 *   4. Uploads images to S3 content bucket
 *   5. Writes design metadata to DynamoDB frc-designs table
 *   6. Marks the theme as used in frc-theme-backlog
 *
 * Input: { weekId: "2026-W11", themeId?: "optional-specific-theme" }
 * Output: { designIds: string[], theme: string, weekId: string }
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  generateDesignDescriptions,
  generateImage,
  type ThemeInput,
  type DesignDescription,
} from './openai-client';

// ---------------------------------------------------------------------------
// AWS SDK Clients (reused across invocations)
// ---------------------------------------------------------------------------

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  {
    marshallOptions: { removeUndefinedValues: true },
  },
);

const s3Client = new S3Client({ region: 'us-east-1' });
const sesClient = new SESv2Client({ region: 'us-east-1' });

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const DESIGNS_TABLE = process.env.DESIGNS_TABLE!;
const THEME_BACKLOG_TABLE = process.env.THEME_BACKLOG_TABLE!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || '';
const API_BASE_URL = process.env.API_BASE_URL || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HandlerInput {
  weekId: string;
  themeId?: string;
}

interface HandlerOutput {
  statusCode: number;
  body: {
    message: string;
    designIds: string[];
    theme: string;
    weekId: string;
    errors?: string[];
  };
}

interface ThemeRecord {
  themeId: string;
  theme: string;
  description: string;
  season: string;
  status: string;
  createdAt: string;
  priority?: number;
  usedInWeek?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a simple unique ID (timestamp + random hex). */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/** Determine the current meteorological season from a week ID (YYYY-Wnn). */
function getSeasonFromWeekId(weekId: string): string {
  // Extract year and week number
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return 'any';

  const weekNum = parseInt(match[2], 10);

  // Approximate seasons by week number (Northern Hemisphere):
  // Spring: W10-W22 (Mar-May)
  // Summer: W23-W35 (Jun-Aug)
  // Autumn: W36-W48 (Sep-Nov)
  // Winter: W49-W52, W01-W09 (Dec-Feb)
  if (weekNum >= 10 && weekNum <= 22) return 'spring';
  if (weekNum >= 23 && weekNum <= 35) return 'summer';
  if (weekNum >= 36 && weekNum <= 48) return 'autumn';
  return 'winter';
}

// ---------------------------------------------------------------------------
// DynamoDB Operations
// ---------------------------------------------------------------------------

/** Check if designs already exist for this week (idempotency guard). */
async function existingDesignsForWeek(weekId: string): Promise<number> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: DESIGNS_TABLE,
      IndexName: 'WeekStatusIndex',
      KeyConditionExpression: 'weekId = :w',
      ExpressionAttributeValues: { ':w': weekId },
      Select: 'COUNT',
    }),
  );
  return result.Count ?? 0;
}

/** Pick an available theme matching the current season. */
async function pickTheme(
  weekId: string,
  themeId?: string,
): Promise<ThemeRecord> {
  // If a specific theme was requested, fetch it directly
  if (themeId) {
    console.log(`[handler] Using specified themeId: ${themeId}`);
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: THEME_BACKLOG_TABLE,
        KeyConditionExpression: 'themeId = :t',
        ExpressionAttributeValues: { ':t': themeId },
        Limit: 1,
      }),
    );

    if (!result.Items || result.Items.length === 0) {
      throw new Error(`Theme not found: ${themeId}`);
    }

    return result.Items[0] as ThemeRecord;
  }

  // Query available themes for the current season
  const season = getSeasonFromWeekId(weekId);
  console.log(
    `[handler] Looking for available themes for season: ${season}`,
  );

  // Query the StatusSeasonIndex for available themes.
  // The GSI has PK=status, SK=season, so we query status='available'
  // and filter for the matching season or 'any'.
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: THEME_BACKLOG_TABLE,
      IndexName: 'StatusSeasonIndex',
      KeyConditionExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': 'available' },
    }),
  );

  if (!result.Items || result.Items.length === 0) {
    throw new Error(
      'No available themes found in the theme backlog. Please seed themes first.',
    );
  }

  // Filter for matching season or 'any'
  const seasonalThemes = result.Items.filter(
    (item) => item.season === season || item.season === 'any',
  );

  const candidates =
    seasonalThemes.length > 0 ? seasonalThemes : result.Items;

  // Pick one randomly
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  console.log(
    `[handler] Selected theme: "${chosen.theme}" (${chosen.themeId}) from ${candidates.length} candidates`,
  );

  return chosen as ThemeRecord;
}

/** Mark a theme as used in the backlog. */
async function markThemeAsUsed(
  themeId: string,
  createdAt: string,
  weekId: string,
): Promise<void> {
  console.log(
    `[handler] Marking theme ${themeId} as used for week ${weekId}`,
  );

  await dynamoClient.send(
    new UpdateCommand({
      TableName: THEME_BACKLOG_TABLE,
      Key: { themeId, createdAt },
      UpdateExpression:
        'SET #s = :used, usedInWeek = :week',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':used': 'used',
        ':week': weekId,
      },
    }),
  );
}

/** Write a design record to DynamoDB. */
async function writeDesignRecord(design: Record<string, unknown>): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: DESIGNS_TABLE,
      Item: design,
    }),
  );
}

// ---------------------------------------------------------------------------
// S3 Operations
// ---------------------------------------------------------------------------

/** Upload an image buffer to S3 and return the S3 key. */
async function uploadImageToS3(
  imageBuffer: Buffer,
  s3Key: string,
): Promise<void> {
  console.log(`[handler] Uploading image to s3://${CONTENT_BUCKET}/${s3Key}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

// ---------------------------------------------------------------------------
// Admin Preview Email
// ---------------------------------------------------------------------------

async function sendAdminPreviewEmail(
  weekId: string,
  themeName: string,
  designIds: string[],
  descriptions: DesignDescription[],
): Promise<void> {
  // Generate presigned URLs for the design images
  const imageUrls: string[] = [];
  const year = weekId.substring(0, 4);
  const weekNum = weekId.substring(5);

  for (const desc of descriptions) {
    const s3Key = `designs/${year}/${weekNum}/${desc.slug}.png`;
    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: s3Key,
    }), { expiresIn: 604800 }); // 7 days
    imageUrls.push(url);
  }

  const displayTheme = themeName
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const approveAllUrl = `${API_BASE_URL}/api/admin/approve?weekId=${weekId}&action=approve-all&token=${ADMIN_TOKEN}`;

  const designCardsHtml = descriptions.map((d, i) => {
    const designId = designIds[i];
    const approveUrl = `${API_BASE_URL}/api/admin/approve?designId=${encodeURIComponent(designId)}&weekId=${weekId}&action=approve&token=${ADMIN_TOKEN}`;
    const rejectUrl = `${API_BASE_URL}/api/admin/approve?designId=${encodeURIComponent(designId)}&weekId=${weekId}&action=reject&token=${ADMIN_TOKEN}`;

    return `
    <div style="margin-bottom: 32px; background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      <img src="${imageUrls[i]}" alt="${d.title}" style="width: 100%; max-width: 500px; border-radius: 8px; display: block;" />
      <h3 style="margin: 12px 0 4px; color: #2D3748;">${d.title}</h3>
      <span style="display: inline-block; padding: 2px 10px; background: ${d.difficulty === 'easy' ? '#C6F6D5' : d.difficulty === 'medium' ? '#FEFCBF' : '#FED7D7'}; border-radius: 12px; font-size: 12px; font-weight: 600;">${d.difficulty}</span>
      <p style="margin: 8px 0; color: #4A5568; font-size: 14px;">${d.description}</p>
      <div style="margin-top: 12px;">
        <a href="${approveUrl}" style="display: inline-block; padding: 8px 20px; background: #48BB78; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; margin-right: 8px;">Approve</a>
        <a href="${rejectUrl}" style="display: inline-block; padding: 8px 20px; background: #FC8181; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">Reject</a>
      </div>
    </div>`;
  }).join('\n');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review: ${weekId} Designs</title></head>
<body style="margin: 0; padding: 0; background: #F7FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; padding: 24px; background: linear-gradient(135deg, #6B46C1, #9F7AEA); border-radius: 12px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: white; font-size: 22px;">New Designs Ready for Review</h1>
    <p style="margin: 8px 0 0; color: #E9D8FD; font-size: 14px;">${weekId} &middot; ${displayTheme} &middot; ${descriptions.length} designs</p>
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${approveAllUrl}" style="display: inline-block; padding: 14px 32px; background: #48BB78; color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;">Approve All ${descriptions.length} Designs</a>
  </div>

  ${designCardsHtml}

  <div style="text-align: center; margin-top: 24px; padding: 16px; color: #A0AEC0; font-size: 12px;">
    FreeReverseColoring.com Admin &middot; ${weekId}
  </div>
</div>
</body>
</html>`;

  const text = `New designs for ${weekId} (${displayTheme})\n\nApprove all: ${approveAllUrl}\n\n${descriptions.map((d, i) => `${i + 1}. ${d.title} (${d.difficulty})\n   ${d.description}`).join('\n\n')}`;

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: SES_FROM_EMAIL,
      Destination: { ToAddresses: [ADMIN_EMAIL] },
      Content: {
        Simple: {
          Subject: { Data: `[FRC Admin] Review ${descriptions.length} new designs for ${weekId}`, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export async function handler(event: HandlerInput): Promise<HandlerOutput> {
  console.log('[handler] Invoked with event:', JSON.stringify(event));

  // Support EventBridge events that wrap the payload in `detail`
  const input: HandlerInput =
    (event as unknown as { detail?: HandlerInput }).detail ?? event;

  const { weekId, themeId } = input;

  if (!weekId) {
    return {
      statusCode: 400,
      body: {
        message: 'weekId is required (format: YYYY-Wnn)',
        designIds: [],
        theme: '',
        weekId: '',
      },
    };
  }

  // Validate weekId format
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    return {
      statusCode: 400,
      body: {
        message: 'Invalid weekId format. Expected YYYY-Wnn (e.g., 2026-W11)',
        designIds: [],
        theme: '',
        weekId,
      },
    };
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Idempotency check — skip if designs already exist for this week
    // -----------------------------------------------------------------------
    const existingCount = await existingDesignsForWeek(weekId);
    if (existingCount > 0) {
      console.log(
        `[handler] ${existingCount} designs already exist for ${weekId}, skipping generation`,
      );
      return {
        statusCode: 200,
        body: {
          message: `Designs already exist for ${weekId} (${existingCount} found). Skipping.`,
          designIds: [],
          theme: '',
          weekId,
        },
      };
    }

    // -----------------------------------------------------------------------
    // Step 2: Pick a theme
    // -----------------------------------------------------------------------
    const theme = await pickTheme(weekId, themeId);

    const themeInput: ThemeInput = {
      themeId: theme.themeId,
      theme: theme.theme,
      description: theme.description,
      season: theme.season,
    };

    // -----------------------------------------------------------------------
    // Step 3: Generate 3 design descriptions with GPT-4o
    // -----------------------------------------------------------------------
    console.log('[handler] Generating design descriptions with GPT-4o...');
    const descriptions = await generateDesignDescriptions(themeInput);

    // -----------------------------------------------------------------------
    // Step 4: Generate images and upload to S3 (continue on individual failures)
    // -----------------------------------------------------------------------
    const designIds: string[] = [];
    const errors: string[] = [];
    const year = weekId.substring(0, 4);
    const weekNum = weekId.substring(5); // "W11"

    for (let i = 0; i < descriptions.length; i++) {
      const design: DesignDescription = descriptions[i];
      const designId = `design-${generateId()}`;

      console.log(
        `[handler] Processing design ${i + 1}/3: "${design.title}" (${designId})`,
      );

      try {
        // Generate image
        console.log(
          `[handler] Generating image for "${design.title}"...`,
        );
        const imageBuffer = await generateImage(design.generationPrompt);
        console.log(
          `[handler] Image generated: ${imageBuffer.length} bytes`,
        );

        // Upload to S3
        const s3Key = `designs/${year}/${weekNum}/${design.slug}.png`;
        await uploadImageToS3(imageBuffer, s3Key);

        // Write design record to DynamoDB
        const now = new Date().toISOString();
        const designRecord = {
          designId,
          weekId,
          title: design.title,
          description: design.description,
          theme: theme.theme,
          difficulty: design.difficulty,
          status: 'pending_review',
          s3Key,
          s3KeyThumbnail: '', // Thumbnails handled later
          s3KeyHighRes: '', // High-res handled later
          imageUrl: '', // Set when CloudFront is configured for content
          thumbnailUrl: '',
          imageUrlHighRes: '',
          width: 1024,
          height: 1536,
          fileSizeBytes: imageBuffer.length,
          colorPalette: design.colorPalette,
          generationPrompt: design.generationPrompt,
          generationModel: 'gpt-image-1',
          generationCostUsd: 0, // Actual cost tracking can be added later
          createdAt: now,
          approvedAt: '',
          publishedAt: '',
          downloadCount: 0,
          printCount: 0,
          isPremium: false,
          tags: design.tags,
          drawingPrompts: design.drawingPrompts,
          slug: design.slug,
        };

        await writeDesignRecord(designRecord);
        designIds.push(designId);

        console.log(
          `[handler] Design "${design.title}" saved successfully (${designId})`,
        );
      } catch (err) {
        const errorMsg = `Failed to generate/save design "${design.title}": ${(err as Error).message}`;
        console.error(`[handler] ${errorMsg}`, err);
        errors.push(errorMsg);
        // Continue with remaining designs
      }
    }

    // -----------------------------------------------------------------------
    // Step 5: Mark theme as used (only if at least one design succeeded)
    // -----------------------------------------------------------------------
    if (designIds.length > 0) {
      await markThemeAsUsed(theme.themeId, theme.createdAt, weekId);
    }

    // -----------------------------------------------------------------------
    // Step 6: Send admin preview email (best-effort, don't fail generation)
    // -----------------------------------------------------------------------
    if (designIds.length > 0 && ADMIN_EMAIL && SES_FROM_EMAIL) {
      try {
        await sendAdminPreviewEmail(weekId, theme.theme, designIds, descriptions);
        console.log(`[handler] Admin preview email sent to ${ADMIN_EMAIL}`);
      } catch (err) {
        console.error(`[handler] Failed to send admin preview (non-fatal):`, err);
      }
    }

    // -----------------------------------------------------------------------
    // Result
    // -----------------------------------------------------------------------
    const resultMessage =
      designIds.length === 3
        ? `Successfully generated 3 designs for ${weekId}`
        : `Generated ${designIds.length}/3 designs for ${weekId} (${errors.length} failed)`;

    console.log(`[handler] ${resultMessage}`);

    return {
      statusCode: designIds.length > 0 ? 200 : 500,
      body: {
        message: resultMessage,
        designIds,
        theme: theme.theme,
        weekId,
        ...(errors.length > 0 ? { errors } : {}),
      },
    };
  } catch (err) {
    const errorMsg = `Content generation failed: ${(err as Error).message}`;
    console.error(`[handler] ${errorMsg}`, err);

    return {
      statusCode: 500,
      body: {
        message: errorMsg,
        designIds: [],
        theme: '',
        weekId,
      },
    };
  }
}
