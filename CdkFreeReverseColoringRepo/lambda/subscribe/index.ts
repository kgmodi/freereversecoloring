import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { randomUUID } from 'crypto';
import { ulid } from 'ulid';

// =========================================================================
// Clients (reused across warm invocations)
// =========================================================================

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});

// =========================================================================
// Environment
// =========================================================================

const SUBSCRIBERS_TABLE = process.env.SUBSCRIBERS_TABLE!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const API_BASE_URL = process.env.API_BASE_URL!;
const SITE_URL = process.env.SITE_URL!;
const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET;

// =========================================================================
// Helpers
// =========================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Rate limiting: max 5 subscribes per IP per hour
const RATE_LIMIT_TABLE = process.env.SUBSCRIBERS_TABLE; // Reuse table with rate-limit prefix
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function response(statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: JSON.stringify(body),
  };
}

function generateReferralCode(name?: string): string {
  const prefix = name ? name.replace(/[^a-zA-Z]/g, '').substring(0, 6).toUpperCase() : 'USER';
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${suffix}`;
}

// =========================================================================
// Email Template
// =========================================================================

function buildConfirmationEmail(name: string, confirmUrl: string): { html: string; text: string } {
  const displayName = name || 'there';
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #6B46C1; font-size: 24px;">Welcome to FreeReverseColoring!</h1>
  <p>Hi ${displayName},</p>
  <p>Thanks for signing up! Reverse coloring is a creative twist on traditional coloring pages &mdash;
     you get a pre-colored watercolor background and draw your own outlines on top.</p>
  <p>Please confirm your subscription to start receiving free designs every week:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${confirmUrl}"
       style="background-color: #6B46C1; color: white; padding: 14px 28px; text-decoration: none;
              border-radius: 6px; font-weight: bold; display: inline-block;">
      Confirm My Subscription
    </a>
  </p>
  <p style="font-size: 13px; color: #666;">
    Or copy and paste this link into your browser:<br>
    <a href="${confirmUrl}" style="color: #6B46C1;">${confirmUrl}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">
    If you didn't sign up for FreeReverseColoring, you can safely ignore this email.
  </p>
</body>
</html>`.trim();

  const text = `Welcome to FreeReverseColoring!

Hi ${displayName},

Thanks for signing up! Please confirm your subscription by visiting this link:

${confirmUrl}

If you didn't sign up for FreeReverseColoring, you can safely ignore this email.`;

  return { html, text };
}

// =========================================================================
// Query existing subscriber by email
// =========================================================================

async function findSubscriberByEmail(email: string) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: SUBSCRIBERS_TABLE,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    }),
  );
  return result.Items?.[0] ?? null;
}

// =========================================================================
// Send confirmation email via SES
// =========================================================================

async function sendConfirmationEmail(email: string, name: string, token: string) {
  const confirmUrl = `${API_BASE_URL}/api/confirm?token=${encodeURIComponent(token)}`;
  const { html, text } = buildConfirmationEmail(name, confirmUrl);

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: SES_FROM_EMAIL,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: 'Confirm your FreeReverseColoring subscription', Charset: 'UTF-8' },
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

// =========================================================================
// Handler
// =========================================================================

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return response(200, { message: 'OK' });
  }

  try {
    // Parse body
    if (!event.body) {
      return response(400, { error: 'Request body is required' });
    }

    let body: { email?: string; name?: string; source?: string };
    try {
      body = JSON.parse(event.body);
    } catch {
      return response(400, { error: 'Invalid JSON in request body' });
    }

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim() || '';
    const source = body.source?.trim() || 'website_signup';

    // Validate email format (requires 2+ char TLD to catch typos like .cmo)
    if (!email || !EMAIL_REGEX.test(email)) {
      return response(400, { error: 'A valid email address is required' });
    }

    // Rate limiting by IP
    const sourceIp = event.requestContext?.identity?.sourceIp || 'unknown';
    const rateLimitKey = `RATELIMIT#${sourceIp}`;
    const currentMs = Date.now();
    const windowStart = new Date(currentMs - RATE_LIMIT_WINDOW_MS).toISOString();

    try {
      const rateLimitResult = await ddb.send(
        new QueryCommand({
          TableName: RATE_LIMIT_TABLE,
          KeyConditionExpression: 'subscriberId = :pk AND createdAt > :window',
          ExpressionAttributeValues: {
            ':pk': rateLimitKey,
            ':window': windowStart,
          },
        }),
      );
      if ((rateLimitResult.Count ?? 0) >= RATE_LIMIT_MAX) {
        return response(429, { error: 'Too many requests. Please try again later.' });
      }
    } catch {
      // Don't block signups if rate limit check fails
    }

    // Record this attempt for rate limiting
    try {
      await ddb.send(
        new PutCommand({
          TableName: RATE_LIMIT_TABLE,
          Item: {
            subscriberId: rateLimitKey,
            createdAt: new Date().toISOString(),
            ttl: Math.floor((currentMs + RATE_LIMIT_WINDOW_MS) / 1000),
          },
        }),
      );
    } catch {
      // Non-critical
    }

    // Check for existing subscriber
    const existing = await findSubscriberByEmail(email);

    if (existing) {
      if (existing.status === 'confirmed') {
        return response(200, { message: 'You are already subscribed!', subscriberId: existing.subscriberId });
      }

      if (existing.status === 'pending_confirmation') {
        // Resend confirmation email with existing token
        try {
          await sendConfirmationEmail(email, existing.name || name, existing.confirmationToken);
        } catch (sesError) {
          console.error('SES send failed (resend):', sesError);
          // Don't fail the request -- the subscriber record exists
        }
        return response(200, {
          message: 'Confirmation email resent. Please check your inbox.',
          subscriberId: existing.subscriberId,
        });
      }

      if (existing.status === 'unsubscribed') {
        // Reactivate with new confirmation token
        const newToken = randomUUID();
        const now = new Date().toISOString();

        await ddb.send(
          new UpdateCommand({
            TableName: SUBSCRIBERS_TABLE,
            Key: { subscriberId: existing.subscriberId, createdAt: existing.createdAt },
            UpdateExpression:
              'SET #status = :status, confirmationToken = :token, updatedAt = :now, #name = :name, #source = :source',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#name': 'name',
              '#source': 'source',
            },
            ExpressionAttributeValues: {
              ':status': 'pending_confirmation',
              ':token': newToken,
              ':now': now,
              ':name': name || existing.name,
              ':source': source,
            },
          }),
        );

        try {
          await sendConfirmationEmail(email, name || existing.name, newToken);
        } catch (sesError) {
          console.error('SES send failed (reactivation):', sesError);
        }

        return response(200, {
          message: 'Check your email to confirm your subscription.',
          subscriberId: existing.subscriberId,
        });
      }
    }

    // New subscriber
    const subscriberId = ulid();
    const confirmationToken = randomUUID();
    const referralCode = generateReferralCode(name);
    const now = new Date().toISOString();

    await ddb.send(
      new PutCommand({
        TableName: SUBSCRIBERS_TABLE,
        Item: {
          subscriberId,
          createdAt: now,
          updatedAt: now,
          email,
          name,
          status: 'pending_confirmation',
          confirmationToken,
          referralCode,
          source,
        },
      }),
    );

    try {
      await sendConfirmationEmail(email, name, confirmationToken);
    } catch (sesError) {
      console.error('SES send failed (new subscriber):', sesError);
      // Subscriber is saved -- they can still confirm if we retry or they re-submit
    }

    return response(200, {
      message: 'Check your email to confirm your subscription.',
      subscriberId,
    });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return response(500, { error: 'An unexpected error occurred. Please try again.' });
  }
}
