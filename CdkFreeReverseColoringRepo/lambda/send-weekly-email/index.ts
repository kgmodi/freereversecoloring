/**
 * frc-send-weekly-email-handler
 *
 * Sends the weekly reverse coloring email to all confirmed subscribers.
 *
 * 1. Queries approved/pending_review designs for the given weekId
 * 2. Queries all confirmed subscribers
 * 3. Renders an HTML email with this week's design images
 * 4. Sends via SES in batches (50 per batch, 100ms delay between batches)
 * 5. Records the send in frc-email-sends table
 *
 * Input: { weekId: "2026-W11", testMode?: boolean, testEmail?: string }
 * Output: { sent: number, failed: number, weekId: string }
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

// ---------------------------------------------------------------------------
// AWS SDK Clients (reused across warm invocations)
// ---------------------------------------------------------------------------

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  {
    marshallOptions: { removeUndefinedValues: true },
  },
);

const sesClient = new SESv2Client({ region: 'us-east-1' });

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE!;
const DESIGNS_TABLE = process.env.DESIGNS_TABLE!;
const EMAIL_SENDS_TABLE = process.env.EMAIL_SENDS_TABLE!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const API_BASE_URL = process.env.API_BASE_URL!;
const SITE_URL = process.env.SITE_URL!;
const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HandlerInput {
  weekId: string;
  testMode?: boolean;
  testEmail?: string;
}

interface HandlerOutput {
  statusCode: number;
  body: {
    message: string;
    sent: number;
    failed: number;
    weekId: string;
    sendId?: string;
  };
}

interface DesignRecord {
  designId: string;
  weekId: string;
  title: string;
  description: string;
  theme: string;
  difficulty: string;
  status: string;
  s3Key: string;
  slug: string;
  colorPalette: string[];
  drawingPrompts: string[];
}

interface SubscriberRecord {
  subscriberId: string;
  createdAt: string;
  email: string;
  name: string;
  status: string;
  confirmationToken: string;
  referralCode?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a simple unique ID (timestamp + random hex) — avoids external deps. */
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Compute the current ISO week ID (YYYY-Wnn).
 * ISO 8601: week starts on Monday; the first week of the year contains Jan 4.
 */
function getCurrentWeekId(): string {
  const now = new Date();
  // Copy date to avoid mutation
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Monday=1, Sunday=7)
  const dayNum = d.getUTCDay() || 7; // Convert Sunday (0) to 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate week number
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

/** Sleep for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Split an array into chunks of the given size. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// DynamoDB Operations
// ---------------------------------------------------------------------------

/** Query designs for a given weekId (approved or pending_review). */
async function getDesignsForWeek(weekId: string): Promise<DesignRecord[]> {
  console.log(`[handler] Querying designs for weekId: ${weekId}`);

  // WeekStatusIndex has PK=weekId, SK=status
  // We query by weekId and get all statuses, then filter client-side
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: DESIGNS_TABLE,
      IndexName: 'WeekStatusIndex',
      KeyConditionExpression: 'weekId = :weekId',
      ExpressionAttributeValues: { ':weekId': weekId },
    }),
  );

  const designs = (result.Items ?? []) as DesignRecord[];

  // Only send approved designs (admin must approve via preview email)
  // Fallback: if no approved designs exist, include pending_review to avoid empty emails
  let eligible = designs.filter((d) => d.status === 'approved');
  if (eligible.length === 0) {
    console.log('[handler] No approved designs found, falling back to pending_review');
    eligible = designs.filter((d) => d.status === 'pending_review');
  }

  // Cap at 3 designs per email (matches marketing promise of "3 Designs per week")
  const selected = eligible.slice(0, 3);

  console.log(
    `[handler] Found ${designs.length} total designs, ${eligible.length} eligible, sending ${selected.length} (max 3)`,
  );

  return selected;
}

/** Query all confirmed subscribers. Paginate through all results. */
async function getConfirmedSubscribers(): Promise<SubscriberRecord[]> {
  console.log('[handler] Querying confirmed subscribers');

  const subscribers: SubscriberRecord[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: SUBSCRIBERS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'confirmed' },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    subscribers.push(...((result.Items ?? []) as SubscriberRecord[]));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  console.log(`[handler] Found ${subscribers.length} confirmed subscribers`);
  return subscribers;
}

/** Record the email send in the frc-email-sends table. */
async function recordEmailSend(record: {
  sendId: string;
  sentAt: string;
  weekId: string;
  subscriberCount: number;
  designCount: number;
  status: string;
  sentCount: number;
  failedCount: number;
  testMode: boolean;
  testEmail?: string;
}): Promise<void> {
  await dynamoClient.send(
    new PutCommand({
      TableName: EMAIL_SENDS_TABLE,
      Item: record,
    }),
  );
}

// ---------------------------------------------------------------------------
// HTML Email Template
// ---------------------------------------------------------------------------

interface EmailDesign {
  title: string;
  description: string;
  imageUrl: string;
  slug: string;
  difficulty: string;
  drawingPrompts: string[];
}

function buildWeeklyEmail(
  themeName: string,
  designs: EmailDesign[],
  unsubscribeUrl: string,
  referralCode?: string,
): { html: string; text: string } {
  const referralUrl = referralCode
    ? `${SITE_URL}/?ref=${encodeURIComponent(referralCode)}`
    : `${SITE_URL}/#signup`;
  const designCardsHtml = designs
    .map(
      (d) => `
    <!-- Design Card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 32px;">
      <tr>
        <td style="padding: 0;">
          <img src="${d.imageUrl}"
               alt="${d.title}"
               width="560"
               style="width: 100%; max-width: 560px; height: auto; border-radius: 12px; display: block;" />
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 0 4px 0;">
          <h2 style="margin: 0; font-size: 20px; color: #2D3748; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            ${d.title}
          </h2>
          <span style="display: inline-block; margin-top: 4px; padding: 2px 10px; background-color: ${d.difficulty === 'easy' ? '#C6F6D5' : d.difficulty === 'medium' ? '#FEFCBF' : '#FED7D7'}; color: ${d.difficulty === 'easy' ? '#276749' : d.difficulty === 'medium' ? '#975A16' : '#9B2C2C'}; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
            ${d.difficulty}
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0;">
          <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #4A5568; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            ${d.description}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding: 8px 0 0 0;">
          <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #9B7BC7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            Drawing ideas:
          </p>
          ${d.drawingPrompts
            .map(
              (prompt) =>
                `<p style="margin: 0 0 4px 12px; font-size: 13px; color: #718096; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">&bull; ${prompt}</p>`,
            )
            .join('\n          ')}
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 0 0 0;">
          <a href="${SITE_URL}/gallery/${d.slug}"
             style="display: inline-block; padding: 12px 28px; background-color: #9B7BC7; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            Print &amp; Draw
          </a>
        </td>
      </tr>
    </table>`,
    )
    .join('\n');

  const designsTextList = designs
    .map(
      (d, i) =>
        `${i + 1}. ${d.title} (${d.difficulty})\n   ${d.description}\n   Drawing ideas: ${d.drawingPrompts.join(', ')}\n   View: ${SITE_URL}/gallery/${d.slug}`,
    )
    .join('\n\n');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Reverse Coloring Pages</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #F7FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F7FAFC;">
    <tr>
      <td align="center" style="padding: 20px 10px;">

        <!-- Inner container (max 600px) -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07);">

          <!-- Header — light background, branded wordmark -->
          <tr>
            <td style="background-color: #ffffff; padding: 28px 20px; text-align: center; border-bottom: 1px solid #E2E8F0;">
              <!-- "FreeReverseColoring.com" — dark text, "Reverse" in brand purple -->
              <span style="display: block; font-size: 26px; font-weight: 700; color: #2D2B3D; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.3px; line-height: 1.15;">
                Free<span style="color: #9B7BC7;">Reverse</span>Coloring<span style="color: rgba(45,43,61,0.5);">.com</span>
              </span>
              <!-- Tagline -->
              <span style="display: block; font-size: 13px; font-style: italic; color: #6B687D; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: 0.2px; margin-top: 6px;">
                The canvas is ready. You bring the story.
              </span>
            </td>
          </tr>

          <!-- Hero Section -->
          <tr>
            <td style="padding: 32px 20px 16px 20px; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 14px; color: #A0AEC0; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                This week's theme
              </p>
              <h2 style="margin: 0; font-size: 26px; color: #2D3748; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${themeName}
              </h2>
              <p style="margin: 12px 0 0 0; font-size: 15px; color: #718096; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Print these watercolor backgrounds and draw your own outlines on top.
                Grab your favorite pen and let your creativity flow!
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 20px;">
              <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 0;">
            </td>
          </tr>

          <!-- Designs -->
          <tr>
            <td style="padding: 24px 20px;">
              ${designCardsHtml}
            </td>
          </tr>

          <!-- CTA Section -->
          <tr>
            <td style="padding: 0 20px 32px 20px; text-align: center;">
              <a href="${SITE_URL}/gallery"
                 style="display: inline-block; padding: 14px 32px; background-color: #9B7BC7; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Browse All Designs
              </a>
            </td>
          </tr>

          <!-- Share / Referral CTA -->
          <tr>
            <td style="background-color: #F8F5FD; padding: 28px 24px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 700; color: #2D2B3D; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Know someone who'd love this?
              </p>
              <p style="margin: 0 0 16px 0; font-size: 14px; color: #6B687D; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Forward this email to a friend and ask them to subscribe using the link below. They'll get free watercolor pages every week!
              </p>
              <a href="${referralUrl}"
                 style="display: inline-block; padding: 14px 32px; background-color: #9B7BC7; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Subscribe for Free
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F7FAFC; padding: 24px 20px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #A0AEC0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                You're receiving this because you subscribed at
                <a href="${SITE_URL}" style="color: #9B7BC7; text-decoration: underline;">freereversecoloring.com</a>
              </p>
              <p style="margin: 0; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <a href="${unsubscribeUrl}" style="color: #A0AEC0; text-decoration: underline;">Unsubscribe</a>
                &nbsp;&middot;&nbsp;
                <a href="${SITE_URL}" style="color: #A0AEC0; text-decoration: underline;">Visit Website</a>
              </p>
              <p style="margin: 12px 0 0 0; font-size: 11px; color: #CBD5E0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                FreeReverseColoring.com &copy; ${new Date().getFullYear()}
              </p>
            </td>
          </tr>

        </table>
        <!-- /Inner container -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->
</body>
</html>`.trim();

  const text = `FreeReverseColoring - Your Weekly Reverse Coloring Pages

This week's theme: ${themeName}

Print these watercolor backgrounds and draw your own outlines on top!

${designsTextList}

Browse all designs: ${SITE_URL}/gallery

---
Know someone who'd love this? Forward this email!
Your friend can subscribe here: ${referralUrl}

---
You're receiving this because you subscribed at freereversecoloring.com.
Unsubscribe: ${unsubscribeUrl}`;

  return { html, text };
}

// ---------------------------------------------------------------------------
// SES — Send Email
// ---------------------------------------------------------------------------

async function sendEmail(
  toEmail: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: SES_FROM_EMAIL,
      ReplyToAddresses: ['hello@freereversecoloring.com'],
      Destination: { ToAddresses: [toEmail] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      },
      ConfigurationSetName: SES_CONFIGURATION_SET,
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

  const { testMode = false, testEmail } = input;

  // Resolve weekId: "auto" means compute the current ISO week
  let weekId = input.weekId;
  if (!weekId || weekId === 'auto') {
    weekId = getCurrentWeekId();
    console.log(`[handler] Resolved weekId to current week: ${weekId}`);
  }

  // Validate weekId format
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    return {
      statusCode: 400,
      body: {
        message: 'Invalid weekId format. Expected YYYY-Wnn (e.g., 2026-W11)',
        sent: 0,
        failed: 0,
        weekId,
      },
    };
  }

  if (testMode && !testEmail) {
    return {
      statusCode: 400,
      body: {
        message: 'testEmail is required when testMode is true',
        sent: 0,
        failed: 0,
        weekId,
      },
    };
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Get designs for this week
    // -----------------------------------------------------------------------
    const designs = await getDesignsForWeek(weekId);

    if (designs.length === 0) {
      return {
        statusCode: 404,
        body: {
          message: `No eligible designs found for ${weekId}. Generate content first.`,
          sent: 0,
          failed: 0,
          weekId,
        },
      };
    }

    // -----------------------------------------------------------------------
    // Step 2: Build design image URLs (public website URLs — never expire)
    // -----------------------------------------------------------------------
    console.log(`[handler] Building image URLs for ${designs.length} designs`);

    const emailDesigns: EmailDesign[] = designs.map((d) => ({
      title: d.title,
      description: d.description,
      imageUrl: `${SITE_URL}/designs/${d.slug}.png`,
      slug: d.slug,
      difficulty: d.difficulty,
      drawingPrompts: d.drawingPrompts || [],
    }));

    // Use the theme from the first design, formatted for display
    // e.g. "butterfly_meadow" → "Butterfly Meadow"
    const rawTheme = designs[0].theme || 'Creative Exploration';
    const themeName = rawTheme
      .split('_')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // -----------------------------------------------------------------------
    // Step 3: Get recipients
    // -----------------------------------------------------------------------
    let recipients: Array<{ email: string; name: string; confirmationToken: string; referralCode?: string }>;

    if (testMode) {
      console.log(`[handler] Test mode: sending only to ${testEmail}`);
      recipients = [
        {
          email: testEmail!,
          name: 'Test User',
          confirmationToken: 'test-token',
          referralCode: 'TEST1234',
        },
      ];
    } else {
      const subscribers = await getConfirmedSubscribers();

      if (subscribers.length === 0) {
        return {
          statusCode: 200,
          body: {
            message: 'No confirmed subscribers found. No emails sent.',
            sent: 0,
            failed: 0,
            weekId,
          },
        };
      }

      recipients = subscribers.map((s) => ({
        email: s.email,
        name: s.name || '',
        confirmationToken: s.confirmationToken,
        referralCode: s.referralCode,
      }));
    }

    console.log(
      `[handler] Sending to ${recipients.length} recipient(s), ${emailDesigns.length} design(s)`,
    );

    // -----------------------------------------------------------------------
    // Step 4: Send emails in batches
    // -----------------------------------------------------------------------
    const subject = "Your Weekly Reverse Coloring Pages Are Here! \uD83C\uDFA8";
    let sentCount = 0;
    let failedCount = 0;

    const batches = chunk(recipients, 50);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      console.log(
        `[handler] Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} recipients)`,
      );

      // Send emails within a batch concurrently (SES can handle concurrent calls)
      const results = await Promise.allSettled(
        batch.map(async (recipient) => {
          const unsubscribeUrl = `${API_BASE_URL}/api/unsubscribe?token=${encodeURIComponent(recipient.confirmationToken)}`;
          const { html, text } = buildWeeklyEmail(
            themeName,
            emailDesigns,
            unsubscribeUrl,
            recipient.referralCode,
          );

          await sendEmail(recipient.email, subject, html, text);
          return recipient.email;
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          sentCount++;
        } else {
          failedCount++;
          console.error(
            `[handler] Failed to send email:`,
            result.reason,
          );
        }
      }

      // Delay between batches to respect SES rate limits (14/sec in sandbox)
      if (batchIdx < batches.length - 1) {
        console.log('[handler] Waiting 100ms before next batch...');
        await sleep(100);
      }
    }

    // -----------------------------------------------------------------------
    // Step 5: Record the send in frc-email-sends table
    // -----------------------------------------------------------------------
    const sendId = `send-${generateId()}`;
    const sentAt = new Date().toISOString();

    await recordEmailSend({
      sendId,
      sentAt,
      weekId,
      subscriberCount: recipients.length,
      designCount: emailDesigns.length,
      status: failedCount === 0 ? 'completed' : 'completed_with_errors',
      sentCount,
      failedCount,
      testMode,
      testEmail: testMode ? testEmail : undefined,
    });

    console.log(
      `[handler] Email send recorded: ${sendId} — sent=${sentCount}, failed=${failedCount}`,
    );

    // -----------------------------------------------------------------------
    // Result
    // -----------------------------------------------------------------------
    const resultMessage =
      failedCount === 0
        ? `Successfully sent weekly email to ${sentCount} subscriber(s) for ${weekId}`
        : `Sent weekly email: ${sentCount} succeeded, ${failedCount} failed for ${weekId}`;

    console.log(`[handler] ${resultMessage}`);

    return {
      statusCode: 200,
      body: {
        message: resultMessage,
        sent: sentCount,
        failed: failedCount,
        weekId,
        sendId,
      },
    };
  } catch (err) {
    const errorMsg = `Weekly email send failed: ${(err as Error).message}`;
    console.error(`[handler] ${errorMsg}`, err);

    return {
      statusCode: 500,
      body: {
        message: errorMsg,
        sent: 0,
        failed: 0,
        weekId,
      },
    };
  }
}
