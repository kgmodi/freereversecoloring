import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
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
const SITE_URL = process.env.SITE_URL!;

// =========================================================================
// Helpers
// =========================================================================

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

function htmlResponse(statusCode: number, title: string, body: string): APIGatewayProxyResult {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - FreeReverseColoring</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; margin: 0; padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
    }
    .card {
      background: white; border-radius: 12px; padding: 40px;
      max-width: 500px; width: 100%; text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }
    h1 { color: #6B46C1; margin-bottom: 16px; }
    p { line-height: 1.6; color: #555; }
    a.btn {
      display: inline-block; margin-top: 20px; padding: 12px 24px;
      background-color: #6B46C1; color: white; text-decoration: none;
      border-radius: 6px; font-weight: bold;
    }
    a.btn:hover { background-color: #553C9A; }
  </style>
</head>
<body>
  <div class="card">
    ${body}
  </div>
</body>
</html>`.trim();

  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders() },
    body: html,
  };
}

function errorResponse(message: string): APIGatewayProxyResult {
  return htmlResponse(400, 'Invalid Link', `
    <h1>Oops!</h1>
    <p>${message}</p>
    <a class="btn" href="${SITE_URL}">Go to FreeReverseColoring</a>
  `);
}

// =========================================================================
// Handler
// =========================================================================

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: '',
    };
  }

  try {
    const token = event.queryStringParameters?.token;

    if (!token) {
      return errorResponse('This confirmation link is invalid or incomplete.');
    }

    // Look up subscriber by confirmation token via GSI
    // ConfirmationTokenIndex is KEYS_ONLY, so we get subscriberId + createdAt
    const tokenResult = await ddb.send(
      new QueryCommand({
        TableName: SUBSCRIBERS_TABLE,
        IndexName: 'ConfirmationTokenIndex',
        KeyConditionExpression: 'confirmationToken = :token',
        ExpressionAttributeValues: { ':token': token },
        Limit: 1,
      }),
    );

    const tokenRecord = tokenResult.Items?.[0];
    if (!tokenRecord) {
      return errorResponse('This confirmation link is invalid or has already been used.');
    }

    // Fetch full subscriber record using the primary key from the GSI result
    const subscriberResult = await ddb.send(
      new GetCommand({
        TableName: SUBSCRIBERS_TABLE,
        Key: {
          subscriberId: tokenRecord.subscriberId,
          createdAt: tokenRecord.createdAt,
        },
      }),
    );

    const subscriber = subscriberResult.Item;
    if (!subscriber) {
      return errorResponse('This confirmation link is invalid or has already been used.');
    }

    // Already confirmed
    if (subscriber.status === 'confirmed') {
      return htmlResponse(200, 'Already Confirmed', `
        <h1>Already Confirmed</h1>
        <p>Your subscription is already active. You'll receive free reverse coloring designs every week!</p>
        <a class="btn" href="${SITE_URL}">Visit FreeReverseColoring</a>
      `);
    }

    // Update status to confirmed
    const now = new Date().toISOString();
    await ddb.send(
      new UpdateCommand({
        TableName: SUBSCRIBERS_TABLE,
        Key: {
          subscriberId: subscriber.subscriberId,
          createdAt: subscriber.createdAt,
        },
        UpdateExpression: 'SET #status = :status, confirmedAt = :confirmedAt, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'confirmed',
          ':confirmedAt': now,
          ':now': now,
        },
      }),
    );

    return htmlResponse(200, 'Subscription Confirmed', `
      <h1>You're Confirmed!</h1>
      <p>Welcome to FreeReverseColoring! You'll start receiving free reverse coloring designs in your inbox every week.</p>
      <p>Get ready to unleash your creativity with our watercolor backgrounds!</p>
      <a class="btn" href="${SITE_URL}">Visit FreeReverseColoring</a>
    `);
  } catch (err) {
    console.error('Confirm handler error:', err);
    return htmlResponse(500, 'Error', `
      <h1>Something went wrong</h1>
      <p>We couldn't process your confirmation. Please try clicking the link again, or contact us if the problem persists.</p>
      <a class="btn" href="${SITE_URL}">Go to FreeReverseColoring</a>
    `);
  }
}
