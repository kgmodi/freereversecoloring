/**
 * frc-verify-email-handler
 *
 * Handles email verification via OTP (one-time passcode) to prevent abuse
 * of the custom generation feature. Two operations:
 *
 *   POST /api/verify-email   -> Send a 6-digit OTP to the given email
 *   POST /api/verify-code    -> Verify the OTP and mark the email as verified
 *
 * DynamoDB Table: frc-email-verifications
 *   Partition key: email (string)
 *   TTL attribute: ttl (auto-expiry after 10 minutes)
 *
 * Security:
 *   - Max 5 verification attempts per OTP (brute-force protection)
 *   - OTP expires after 10 minutes
 *   - Rate limit: max 3 OTP requests per email per hour
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { randomInt } from 'crypto';

// ---------------------------------------------------------------------------
// AWS SDK Clients (reused across warm invocations)
// ---------------------------------------------------------------------------

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const sesClient = new SESv2Client({ region: 'us-east-1' });

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const VERIFICATIONS_TABLE = process.env.VERIFICATIONS_TABLE!;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL!;
const SITE_URL = process.env.SITE_URL!;

const ALLOWED_ORIGINS = [
  'https://freereversecoloring.com',
  'https://www.freereversecoloring.com',
  'http://localhost:3000',
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_OTP_REQUESTS_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface APIGatewayEvent {
  httpMethod: string;
  body: string | null;
  headers: Record<string, string | undefined>;
  resource: string;
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

function corsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function generateOTP(): string {
  // Generate a cryptographically random 6-digit code (100000 - 999999)
  return String(randomInt(100000, 1000000));
}

// ---------------------------------------------------------------------------
// Email Template
// ---------------------------------------------------------------------------

function buildVerificationEmail(code: string): { html: string; text: string } {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="color: #6B46C1; font-size: 24px;">FreeReverseColoring</h1>
  <p>Here is your verification code:</p>
  <p style="text-align: center; margin: 30px 0;">
    <span style="background-color: #F3F0FF; color: #6B46C1; padding: 16px 32px; font-size: 32px;
                 font-weight: bold; letter-spacing: 6px; border-radius: 8px; display: inline-block;
                 border: 2px solid #6B46C1;">
      ${code}
    </span>
  </p>
  <p>Enter this code on the website to verify your email address. This code expires in <strong>10 minutes</strong>.</p>
  <p>If you didn't request this code, you can safely ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  <p style="font-size: 12px; color: #999;">
    &copy; FreeReverseColoring &mdash; <a href="${SITE_URL}" style="color: #6B46C1;">${SITE_URL}</a>
  </p>
</body>
</html>`.trim();

  const text = `Your FreeReverseColoring verification code is: ${code}

Enter this code on the website to verify your email address. This code expires in 10 minutes.

If you didn't request this code, you can safely ignore this email.`;

  return { html, text };
}

// ---------------------------------------------------------------------------
// POST /api/verify-email — Send OTP
// ---------------------------------------------------------------------------

async function handleSendOTP(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  // Parse request body
  let body: { email?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Invalid JSON body', origin);
  }

  const email = body.email?.trim().toLowerCase();

  // Validate email
  if (!email) {
    return errorResponse(400, 'Email is required', origin);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return errorResponse(400, 'Please enter a valid email address', origin);
  }

  try {
    // -----------------------------------------------------------------------
    // Rate limit: max 3 OTP requests per email per hour
    // -----------------------------------------------------------------------
    const existing = await dynamoClient.send(
      new GetCommand({
        TableName: VERIFICATIONS_TABLE,
        Key: { email },
      }),
    );

    if (existing.Item) {
      const item = existing.Item;
      const requestCount = item.requestCount || 1;
      const rateLimitResetAt = item.rateLimitResetAt || 0;
      const now = Math.floor(Date.now() / 1000);

      // If the rate limit window has not expired and we have hit the max
      if (rateLimitResetAt > now && requestCount >= MAX_OTP_REQUESTS_PER_HOUR) {
        const minutesLeft = Math.ceil((rateLimitResetAt - now) / 60);
        console.log(
          `[verify-email] Rate limit hit for ${maskEmail(email)}: ${requestCount}/${MAX_OTP_REQUESTS_PER_HOUR} requests, resets in ${minutesLeft}m`,
        );
        return errorResponse(429, 'Too many verification requests. Please try again later.', origin, {
          retryAfterMinutes: minutesLeft,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Generate OTP and store in DynamoDB
    // -----------------------------------------------------------------------
    const code = generateOTP();
    const now = new Date();
    const nowUnix = Math.floor(now.getTime() / 1000);
    const ttl = nowUnix + OTP_EXPIRY_SECONDS;
    const rateLimitResetAt = existing.Item?.rateLimitResetAt && existing.Item.rateLimitResetAt > nowUnix
      ? existing.Item.rateLimitResetAt
      : nowUnix + RATE_LIMIT_WINDOW_SECONDS;

    // Increment request count within the rate limit window, or reset to 1
    const previousResetAt = existing.Item?.rateLimitResetAt || 0;
    const requestCount = previousResetAt > nowUnix
      ? (existing.Item?.requestCount || 0) + 1
      : 1;

    await dynamoClient.send(
      new PutCommand({
        TableName: VERIFICATIONS_TABLE,
        Item: {
          email,
          code,
          createdAt: now.toISOString(),
          ttl,
          attempts: 0,
          requestCount,
          rateLimitResetAt,
        },
      }),
    );

    console.log(
      `[verify-email] OTP sent to ${maskEmail(email)}, requestCount: ${requestCount}/${MAX_OTP_REQUESTS_PER_HOUR}`,
    );

    // -----------------------------------------------------------------------
    // Send OTP via SES
    // -----------------------------------------------------------------------
    const { html, text } = buildVerificationEmail(code);

    await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: SES_FROM_EMAIL,
        Destination: { ToAddresses: [email] },
        Content: {
          Simple: {
            Subject: {
              Data: 'Your FreeReverseColoring verification code',
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

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        success: true,
        message: 'Verification code sent',
      }),
    };
  } catch (err) {
    const errorMsg = `Failed to send verification code: ${(err as Error).message}`;
    console.error(`[verify-email] ${errorMsg}`, err);
    return errorResponse(500, 'Something went wrong. Please try again.', origin);
  }
}

// ---------------------------------------------------------------------------
// POST /api/verify-code — Verify OTP
// ---------------------------------------------------------------------------

async function handleVerifyCode(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  const origin = event.headers?.origin || event.headers?.Origin;

  // Parse request body
  let body: { email?: string; code?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'Invalid JSON body', origin);
  }

  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();

  // Validate inputs
  if (!email || !code) {
    return errorResponse(400, 'Both email and code are required', origin);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return errorResponse(400, 'Please enter a valid email address', origin);
  }

  if (!/^\d{6}$/.test(code)) {
    return errorResponse(400, 'Verification code must be 6 digits', origin);
  }

  try {
    // -----------------------------------------------------------------------
    // Look up the verification record
    // -----------------------------------------------------------------------
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: VERIFICATIONS_TABLE,
        Key: { email },
      }),
    );

    if (!result.Item) {
      console.log(`[verify-email] No verification record found for ${maskEmail(email)}`);
      return errorResponse(400, 'No verification code found for this email. Please request a new one.', origin);
    }

    const item = result.Item;
    const nowUnix = Math.floor(Date.now() / 1000);

    // -----------------------------------------------------------------------
    // Check if OTP has expired
    // -----------------------------------------------------------------------
    if (item.ttl && item.ttl <= nowUnix) {
      console.log(`[verify-email] Expired OTP for ${maskEmail(email)}`);
      // Clean up the expired record
      await dynamoClient.send(
        new DeleteCommand({
          TableName: VERIFICATIONS_TABLE,
          Key: { email },
        }),
      );
      return errorResponse(400, 'Verification code has expired. Please request a new one.', origin);
    }

    // -----------------------------------------------------------------------
    // Check attempt limit
    // -----------------------------------------------------------------------
    const attempts = item.attempts || 0;
    if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
      console.log(
        `[verify-email] Max attempts reached for ${maskEmail(email)}: ${attempts}/${MAX_VERIFICATION_ATTEMPTS}`,
      );
      // Delete the record to force requesting a new OTP
      await dynamoClient.send(
        new DeleteCommand({
          TableName: VERIFICATIONS_TABLE,
          Key: { email },
        }),
      );
      return errorResponse(400, 'Too many failed attempts. Please request a new verification code.', origin);
    }

    // -----------------------------------------------------------------------
    // Verify the code
    // -----------------------------------------------------------------------
    if (item.code !== code) {
      // Increment attempts counter
      const newAttempts = attempts + 1;
      await dynamoClient.send(
        new UpdateCommand({
          TableName: VERIFICATIONS_TABLE,
          Key: { email },
          UpdateExpression: 'SET attempts = :attempts',
          ExpressionAttributeValues: {
            ':attempts': newAttempts,
          },
        }),
      );

      const remainingAttempts = MAX_VERIFICATION_ATTEMPTS - newAttempts;
      console.log(
        `[verify-email] Invalid code for ${maskEmail(email)}, attempt ${newAttempts}/${MAX_VERIFICATION_ATTEMPTS}`,
      );

      return errorResponse(400, 'Invalid verification code.', origin, {
        remainingAttempts,
      });
    }

    // -----------------------------------------------------------------------
    // Code is valid — delete the used token
    // -----------------------------------------------------------------------
    await dynamoClient.send(
      new DeleteCommand({
        TableName: VERIFICATIONS_TABLE,
        Key: { email },
      }),
    );

    console.log(`[verify-email] Email verified successfully: ${maskEmail(email)}`);

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({
        verified: true,
        email,
      }),
    };
  } catch (err) {
    const errorMsg = `Verification failed: ${(err as Error).message}`;
    console.error(`[verify-email] ${errorMsg}`, err);
    return errorResponse(500, 'Something went wrong. Please try again.', origin);
  }
}

// ---------------------------------------------------------------------------
// Main Handler (routes by resource path)
// ---------------------------------------------------------------------------

export async function handler(event: APIGatewayEvent): Promise<APIGatewayResponse> {
  console.log('[verify-email] Invoked:', JSON.stringify({
    method: event.httpMethod,
    resource: event.resource,
    bodyLength: event.body?.length,
  }));

  // NOTE: CORS preflight OPTIONS requests are handled automatically by
  // API Gateway's defaultCorsPreflightOptions — no Lambda handling needed.

  if (event.httpMethod !== 'POST') {
    const origin = event.headers?.origin || event.headers?.Origin;
    return errorResponse(405, 'Method not allowed', origin);
  }

  if (event.resource === '/api/verify-email') {
    return handleSendOTP(event);
  }

  if (event.resource === '/api/verify-code') {
    return handleVerifyCode(event);
  }

  const origin = event.headers?.origin || event.headers?.Origin;
  return errorResponse(404, 'Not found', origin);
}
