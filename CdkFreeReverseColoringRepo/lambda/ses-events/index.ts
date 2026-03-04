/**
 * frc-ses-event-handler
 *
 * Processes all SES engagement events delivered via SNS:
 * - Send, Delivery, Bounce, Complaint, Open, Click, Reject
 *
 * Actions:
 * 1. Records every event in frc-email-events table (for analytics)
 * 2. For Bounce/Complaint: updates subscriber status to prevent future sends
 */

import { SNSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

// =========================================================================
// Clients
// =========================================================================

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// =========================================================================
// Environment
// =========================================================================

const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE!;
const EMAIL_EVENTS_TABLE = process.env.EMAIL_EVENTS_TABLE!;

// =========================================================================
// Types
// =========================================================================

interface SesNotification {
  notificationType?: string;
  eventType?: string;
  bounce?: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
    feedbackId: string;
  };
  complaint?: {
    complainedRecipients: Array<{ emailAddress: string }>;
    complaintFeedbackType?: string;
    timestamp: string;
    feedbackId: string;
  };
  open?: {
    timestamp: string;
    ipAddress?: string;
    userAgent?: string;
  };
  click?: {
    timestamp: string;
    ipAddress?: string;
    userAgent?: string;
    link: string;
  };
  mail: {
    timestamp: string;
    source: string;
    messageId: string;
    destination: string[];
  };
}

// =========================================================================
// DynamoDB — Subscriber Operations
// =========================================================================

async function findSubscriberByEmail(
  email: string,
): Promise<{ subscriberId: string; createdAt: string; status: string } | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: SUBSCRIBERS_TABLE,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as { subscriberId: string; createdAt: string; status: string }) ?? null;
}

async function markAsBounced(
  subscriberId: string,
  createdAt: string,
  bounceType: string,
): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: SUBSCRIBERS_TABLE,
      Key: { subscriberId, createdAt },
      UpdateExpression:
        'SET #status = :status, bouncedAt = :bouncedAt, bounceType = :bounceType, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'bounced',
        ':bouncedAt': now,
        ':bounceType': bounceType,
        ':now': now,
      },
    }),
  );
}

async function markAsComplained(
  subscriberId: string,
  createdAt: string,
): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: SUBSCRIBERS_TABLE,
      Key: { subscriberId, createdAt },
      UpdateExpression:
        'SET #status = :status, complainedAt = :complainedAt, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'complained',
        ':complainedAt': now,
        ':now': now,
      },
    }),
  );
}

// =========================================================================
// DynamoDB — Event Recording
// =========================================================================

/** Record an engagement event. TTL = 90 days. */
async function recordEvent(
  messageId: string,
  eventType: string,
  timestamp: string,
  recipient: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days
  await ddb.send(
    new PutCommand({
      TableName: EMAIL_EVENTS_TABLE,
      Item: {
        messageId,
        eventTimestamp: `${timestamp}#${eventType}`,
        eventType,
        timestamp,
        recipient,
        ttl,
        ...details,
      },
    }),
  );
}

// =========================================================================
// Event Processors
// =========================================================================

async function processBounce(notification: SesNotification): Promise<void> {
  const bounce = notification.bounce;
  if (!bounce) return;

  for (const recipient of bounce.bouncedRecipients) {
    const email = recipient.emailAddress.toLowerCase();
    console.log(`[ses-events] Bounce (${bounce.bounceType}): ${email}`);

    await recordEvent(notification.mail.messageId, 'Bounce', bounce.timestamp, email, {
      bounceType: bounce.bounceType,
      bounceSubType: bounce.bounceSubType,
      diagnosticCode: recipient.diagnosticCode,
    });

    try {
      const subscriber = await findSubscriberByEmail(email);
      if (!subscriber) continue;
      if (subscriber.status === 'bounced' || subscriber.status === 'complained') continue;
      await markAsBounced(subscriber.subscriberId, subscriber.createdAt, bounce.bounceType);
      console.log(`[ses-events] Marked ${email} as bounced`);
    } catch (err) {
      console.error(`[ses-events] Error updating bounce for ${email}:`, err);
    }
  }
}

async function processComplaint(notification: SesNotification): Promise<void> {
  const complaint = notification.complaint;
  if (!complaint) return;

  for (const recipient of complaint.complainedRecipients) {
    const email = recipient.emailAddress.toLowerCase();
    console.log(`[ses-events] Complaint: ${email}`);

    await recordEvent(notification.mail.messageId, 'Complaint', complaint.timestamp, email, {
      complaintFeedbackType: complaint.complaintFeedbackType,
    });

    try {
      const subscriber = await findSubscriberByEmail(email);
      if (!subscriber) continue;
      if (subscriber.status === 'complained') continue;
      await markAsComplained(subscriber.subscriberId, subscriber.createdAt);
      console.log(`[ses-events] Marked ${email} as complained`);
    } catch (err) {
      console.error(`[ses-events] Error updating complaint for ${email}:`, err);
    }
  }
}

async function processOpen(notification: SesNotification): Promise<void> {
  const open = notification.open;
  if (!open) return;

  const recipient = notification.mail.destination[0]?.toLowerCase() ?? 'unknown';
  console.log(`[ses-events] Open: ${recipient}`);

  await recordEvent(notification.mail.messageId, 'Open', open.timestamp, recipient, {
    ipAddress: open.ipAddress,
    userAgent: open.userAgent,
  });
}

async function processClick(notification: SesNotification): Promise<void> {
  const click = notification.click;
  if (!click) return;

  const recipient = notification.mail.destination[0]?.toLowerCase() ?? 'unknown';
  console.log(`[ses-events] Click: ${recipient} -> ${click.link}`);

  await recordEvent(notification.mail.messageId, 'Click', click.timestamp, recipient, {
    link: click.link,
    ipAddress: click.ipAddress,
    userAgent: click.userAgent,
  });
}

// =========================================================================
// Handler
// =========================================================================

export async function handler(event: SNSEvent): Promise<{ statusCode: number; body: string }> {
  console.log('[ses-events] Received', event.Records.length, 'record(s)');

  let processedCount = 0;
  let errorCount = 0;

  for (const record of event.Records) {
    try {
      const notification: SesNotification = JSON.parse(record.Sns.Message);
      const eventType = notification.eventType ?? notification.notificationType;

      // Record Send/Delivery/Reject as simple events
      if (eventType === 'Send' || eventType === 'Delivery' || eventType === 'Reject') {
        const recipient = notification.mail.destination[0]?.toLowerCase() ?? 'unknown';
        await recordEvent(
          notification.mail.messageId,
          eventType,
          notification.mail.timestamp,
          recipient,
        );
        processedCount++;
        continue;
      }

      switch (eventType) {
        case 'Bounce':
          await processBounce(notification);
          processedCount++;
          break;
        case 'Complaint':
          await processComplaint(notification);
          processedCount++;
          break;
        case 'Open':
          await processOpen(notification);
          processedCount++;
          break;
        case 'Click':
          await processClick(notification);
          processedCount++;
          break;
        default:
          console.warn(`[ses-events] Unhandled event type: ${eventType}`);
          break;
      }
    } catch (err) {
      console.error('[ses-events] Error processing record:', err);
      errorCount++;
    }
  }

  console.log(`[ses-events] Done: ${processedCount} processed, ${errorCount} errors`);
  return { statusCode: 200, body: `${processedCount} processed, ${errorCount} errors` };
}
