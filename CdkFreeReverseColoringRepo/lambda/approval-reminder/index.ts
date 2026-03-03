/**
 * frc-approval-reminder-handler
 *
 * Checks if there are unapproved designs for the current week.
 * If any are still pending_review, sends a reminder email to the admin
 * with image previews and individual approve/reject buttons.
 * Triggered by EventBridge on Tuesday morning.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const s3Client = new S3Client({ region: 'us-east-1' });
const sesClient = new SESv2Client({ region: 'us-east-1' });

const DESIGNS_TABLE = process.env.DESIGNS_TABLE!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const API_BASE_URL = process.env.API_BASE_URL!;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN!;

function getCurrentWeekId(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor(
    (now.getTime() - jan1.getTime()) / 86400000,
  );
  const weekNum = Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export async function handler() {
  const weekId = getCurrentWeekId();
  console.log(`[reminder] Checking for unapproved designs in ${weekId}`);

  // Query designs for this week
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: DESIGNS_TABLE,
      IndexName: 'WeekStatusIndex',
      KeyConditionExpression: 'weekId = :weekId',
      ExpressionAttributeValues: { ':weekId': weekId },
    }),
  );

  const designs = (result.Items ?? []) as Array<{
    designId: string;
    weekId: string;
    title: string;
    description: string;
    slug: string;
    difficulty: string;
    s3Key: string;
    status: string;
  }>;

  const pending = designs.filter((d) => d.status === 'pending_review');
  const approved = designs.filter((d) => d.status === 'approved');

  if (pending.length === 0) {
    console.log(`[reminder] No pending designs — ${approved.length} already approved. No reminder needed.`);
    return { sent: false, reason: 'no_pending_designs' };
  }

  console.log(`[reminder] ${pending.length} designs still pending_review. Sending reminder.`);

  const approveAllUrl = `${API_BASE_URL}/api/admin/approve?weekId=${weekId}&action=approve-all&token=${ADMIN_TOKEN}`;

  // Generate presigned image URLs and build design cards
  const designCardsHtml: string[] = [];
  for (const d of pending) {
    // Derive S3 key: pipeline designs store s3Key, fallback to convention
    const s3Key = d.s3Key || `designs/${weekId}/${d.slug}.png`;
    const imageUrl = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: s3Key,
    }), { expiresIn: 604800 }); // 7 days

    const approveUrl = `${API_BASE_URL}/api/admin/approve?designId=${encodeURIComponent(d.designId)}&weekId=${weekId}&action=approve&token=${ADMIN_TOKEN}`;
    const rejectUrl = `${API_BASE_URL}/api/admin/approve?designId=${encodeURIComponent(d.designId)}&weekId=${weekId}&action=reject&token=${ADMIN_TOKEN}`;

    designCardsHtml.push(`
    <div style="margin-bottom: 32px; background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      <img src="${imageUrl}" alt="${d.title}" style="width: 100%; max-width: 500px; border-radius: 8px; display: block;" />
      <h3 style="margin: 12px 0 4px; color: #2D3748;">${d.title}</h3>
      <span style="display: inline-block; padding: 2px 10px; background: ${d.difficulty === 'easy' ? '#C6F6D5' : d.difficulty === 'medium' ? '#FEFCBF' : '#FED7D7'}; border-radius: 12px; font-size: 12px; font-weight: 600;">${d.difficulty}</span>
      <p style="margin: 8px 0; color: #4A5568; font-size: 14px;">${d.description || ''}</p>
      <div style="margin-top: 12px;">
        <a href="${approveUrl}" style="display: inline-block; padding: 8px 20px; background: #48BB78; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; margin-right: 8px;">Approve</a>
        <a href="${rejectUrl}" style="display: inline-block; padding: 8px 20px; background: #FC8181; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px;">Reject</a>
      </div>
    </div>`);
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reminder: Approve designs for ${weekId}</title></head>
<body style="margin: 0; padding: 0; background: #F7FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; padding: 24px; background: linear-gradient(135deg, #DD6B20, #ED8936); border-radius: 12px; margin-bottom: 24px;">
    <h1 style="margin: 0; color: white; font-size: 22px;">Reminder: Designs Need Approval</h1>
    <p style="margin: 8px 0 0; color: #FEEBC8; font-size: 14px;">${weekId} &middot; ${pending.length} design${pending.length > 1 ? 's' : ''} pending &middot; Email sends tomorrow</p>
  </div>

  <p style="margin: 0 0 16px; color: #2D3748; font-size: 15px; text-align: center;">
    The weekly email goes out <strong>tomorrow (Wednesday)</strong>. Review and approve below:
  </p>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${approveAllUrl}" style="display: inline-block; padding: 14px 32px; background: #48BB78; color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;">Approve All ${pending.length} Designs</a>
  </div>

  ${designCardsHtml.join('\n')}

  ${approved.length > 0 ? `<p style="text-align: center; color: #718096; font-size: 13px;">${approved.length} design${approved.length > 1 ? 's' : ''} already approved for this week.</p>` : ''}

  <div style="text-align: center; padding: 16px; color: #A0AEC0; font-size: 12px;">
    FreeReverseColoring.com Admin &middot; Automated reminder
  </div>
</div>
</body>
</html>`;

  const text = `Reminder: ${pending.length} designs for ${weekId} still need approval.\n\nThe weekly email goes out tomorrow (Wednesday).\n\nPending:\n${pending.map((d) => `  - ${d.title}`).join('\n')}\n\nApprove all: ${approveAllUrl}`;

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: SES_FROM_EMAIL,
      Destination: { ToAddresses: [ADMIN_EMAIL] },
      Content: {
        Simple: {
          Subject: {
            Data: `[FRC Reminder] ${pending.length} designs need approval before tomorrow's email`,
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

  console.log(`[reminder] Reminder sent to ${ADMIN_EMAIL}`);
  return { sent: true, pending: pending.length, approved: approved.length };
}
