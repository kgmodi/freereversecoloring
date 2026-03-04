/**
 * frc-ses-event-handler
 *
 * Processes SES bounce and complaint notifications delivered via SNS.
 *
 * Flow:
 * 1. SES detects a bounce or complaint
 * 2. SES publishes the event to the frc-ses-events SNS topic
 * 3. SNS invokes this Lambda with the SES notification as the message body
 * 4. Lambda parses the notification, looks up the subscriber by email, and
 *    updates their status accordingly (bounced / complained)
 *
 * This prevents future sends to addresses that have bounced or complained,
 * which is critical for maintaining SES sending reputation.
 */

import { SNSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// =========================================================================
// Clients (reused across warm invocations)
// =========================================================================

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// =========================================================================
// Environment
// =========================================================================

const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE!;

// =========================================================================
// Types — SES Notification Structure
// =========================================================================

interface SesNotification {
  // SES v1 uses notificationType, SES v2 uses eventType
  notificationType?: 'Bounce' | 'Complaint' | 'Delivery';
  eventType?: 'Bounce' | 'Complaint' | 'Delivery' | 'Send' | 'Open' | 'Click';
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
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    complaintFeedbackType?: string;
    timestamp: string;
    feedbackId: string;
  };
  mail: {
    timestamp: string;
    source: string;
    messageId: string;
    destination: string[];
  };
}

// =========================================================================
// DynamoDB Operations
// =========================================================================

/**
 * Look up a subscriber by email address using the EmailIndex GSI.
 * Returns the first matching subscriber or null.
 */
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

/**
 * Update a subscriber's status to 'bounced' with bounce metadata.
 */
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

/**
 * Update a subscriber's status to 'complained' with complaint metadata.
 */
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
// Bounce Processing
// =========================================================================

async function processBounce(notification: SesNotification): Promise<void> {
  const bounce = notification.bounce;
  if (!bounce) {
    console.warn('[ses-events] Bounce notification missing bounce details');
    return;
  }

  const bounceType = bounce.bounceType;
  console.log(
    `[ses-events] Processing ${bounceType} bounce for ${bounce.bouncedRecipients.length} recipient(s)`,
    JSON.stringify({
      bounceType,
      bounceSubType: bounce.bounceSubType,
      feedbackId: bounce.feedbackId,
      timestamp: bounce.timestamp,
    }),
  );

  for (const recipient of bounce.bouncedRecipients) {
    const email = recipient.emailAddress.toLowerCase();
    console.log(
      `[ses-events] Processing bounce for: ${email}`,
      JSON.stringify({
        action: recipient.action,
        status: recipient.status,
        diagnosticCode: recipient.diagnosticCode,
      }),
    );

    try {
      const subscriber = await findSubscriberByEmail(email);
      if (!subscriber) {
        console.warn(`[ses-events] No subscriber found for bounced email: ${email}`);
        continue;
      }

      // Skip if already bounced or complained — no need to update again
      if (subscriber.status === 'bounced' || subscriber.status === 'complained') {
        console.log(
          `[ses-events] Subscriber ${email} already has status '${subscriber.status}', skipping`,
        );
        continue;
      }

      await markAsBounced(subscriber.subscriberId, subscriber.createdAt, bounceType);
      console.log(
        `[ses-events] Marked subscriber ${email} as bounced (${bounceType})`,
      );
    } catch (err) {
      console.error(`[ses-events] Error processing bounce for ${email}:`, err);
      // Continue processing other recipients even if one fails
    }
  }
}

// =========================================================================
// Complaint Processing
// =========================================================================

async function processComplaint(notification: SesNotification): Promise<void> {
  const complaint = notification.complaint;
  if (!complaint) {
    console.warn('[ses-events] Complaint notification missing complaint details');
    return;
  }

  console.log(
    `[ses-events] Processing complaint for ${complaint.complainedRecipients.length} recipient(s)`,
    JSON.stringify({
      complaintFeedbackType: complaint.complaintFeedbackType,
      feedbackId: complaint.feedbackId,
      timestamp: complaint.timestamp,
    }),
  );

  for (const recipient of complaint.complainedRecipients) {
    const email = recipient.emailAddress.toLowerCase();
    console.log(`[ses-events] Processing complaint for: ${email}`);

    try {
      const subscriber = await findSubscriberByEmail(email);
      if (!subscriber) {
        console.warn(`[ses-events] No subscriber found for complained email: ${email}`);
        continue;
      }

      // Skip if already complained — no need to update again
      if (subscriber.status === 'complained') {
        console.log(
          `[ses-events] Subscriber ${email} already has status 'complained', skipping`,
        );
        continue;
      }

      await markAsComplained(subscriber.subscriberId, subscriber.createdAt);
      console.log(`[ses-events] Marked subscriber ${email} as complained`);
    } catch (err) {
      console.error(`[ses-events] Error processing complaint for ${email}:`, err);
      // Continue processing other recipients even if one fails
    }
  }
}

// =========================================================================
// Handler
// =========================================================================

export async function handler(event: SNSEvent): Promise<{ statusCode: number; body: string }> {
  console.log('[ses-events] Received SNS event with', event.Records.length, 'record(s)');

  let processedCount = 0;
  let errorCount = 0;

  for (const record of event.Records) {
    try {
      const message = record.Sns.Message;
      console.log('[ses-events] Processing SNS message:', message);

      const notification: SesNotification = JSON.parse(message);

      // SES v2 ConfigurationSet events use "eventType", SES v1 uses "notificationType"
      const eventType = notification.eventType ?? notification.notificationType;

      switch (eventType) {
        case 'Bounce':
          await processBounce(notification);
          processedCount++;
          break;

        case 'Complaint':
          await processComplaint(notification);
          processedCount++;
          break;

        case 'Delivery':
          // Delivery notifications are informational only — log and skip
          console.log(
            '[ses-events] Delivery notification received (no action needed):',
            JSON.stringify(notification.mail),
          );
          processedCount++;
          break;

        default:
          console.warn(
            `[ses-events] Unknown or unhandled event type: ${eventType}`,
          );
          break;
      }
    } catch (err) {
      console.error('[ses-events] Error processing SNS record:', err);
      errorCount++;
    }
  }

  const summary = `Processed ${processedCount} notification(s), ${errorCount} error(s)`;
  console.log(`[ses-events] ${summary}`);

  return {
    statusCode: 200,
    body: summary,
  };
}
