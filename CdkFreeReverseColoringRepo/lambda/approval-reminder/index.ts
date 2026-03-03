/**
 * frc-approval-reminder-handler
 *
 * Checks if there are unapproved designs for the current week.
 * If any are still pending_review, sends a reminder email to the admin.
 * Triggered by EventBridge on Tuesday morning.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const sesClient = new SESv2Client({ region: 'us-east-1' });

const DESIGNS_TABLE = process.env.DESIGNS_TABLE!;
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

  const pendingList = pending
    .map((d) => `<li style="margin: 4px 0;">${d.title}</li>`)
    .join('\n');

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

  <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 24px;">
    <p style="margin: 0 0 12px; color: #2D3748; font-size: 15px;">
      The weekly email goes out <strong>tomorrow (Wednesday)</strong>. These designs are still waiting for your approval:
    </p>
    <ul style="color: #4A5568; font-size: 14px; padding-left: 20px;">
      ${pendingList}
    </ul>
    ${approved.length > 0 ? `<p style="margin: 12px 0 0; color: #718096; font-size: 13px;">${approved.length} design${approved.length > 1 ? 's' : ''} already approved for this week.</p>` : ''}
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${approveAllUrl}" style="display: inline-block; padding: 14px 32px; background: #48BB78; color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px;">Approve All ${pending.length} Designs</a>
  </div>

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
