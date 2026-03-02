import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
    const email = event.queryStringParameters?.email?.toLowerCase();

    if (!token || !email) {
      return errorResponse('This unsubscribe link is invalid or incomplete.');
    }

    // Look up subscriber by email via EmailIndex GSI
    const emailResult = await ddb.send(
      new QueryCommand({
        TableName: SUBSCRIBERS_TABLE,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
        Limit: 1,
      }),
    );

    const subscriber = emailResult.Items?.[0];
    if (!subscriber) {
      return errorResponse('We could not find a subscription with that email address.');
    }

    // Validate the token matches the subscriber's confirmationToken
    if (subscriber.confirmationToken !== token) {
      return errorResponse('This unsubscribe link is invalid.');
    }

    // Already unsubscribed
    if (subscriber.status === 'unsubscribed') {
      return htmlResponse(200, 'Already Unsubscribed', `
        <h1>Already Unsubscribed</h1>
        <p>You have already been unsubscribed from FreeReverseColoring emails.</p>
        <p>Changed your mind? You can always re-subscribe on our website.</p>
        <a class="btn" href="${SITE_URL}">Visit FreeReverseColoring</a>
      `);
    }

    // Update status to unsubscribed
    const now = new Date().toISOString();
    await ddb.send(
      new UpdateCommand({
        TableName: SUBSCRIBERS_TABLE,
        Key: {
          subscriberId: subscriber.subscriberId,
          createdAt: subscriber.createdAt,
        },
        UpdateExpression: 'SET #status = :status, unsubscribedAt = :unsubscribedAt, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'unsubscribed',
          ':unsubscribedAt': now,
          ':now': now,
        },
      }),
    );

    return htmlResponse(200, 'Unsubscribed', `
      <h1>You've Been Unsubscribed</h1>
      <p>We're sorry to see you go! You will no longer receive FreeReverseColoring emails.</p>
      <p>If this was a mistake, you can re-subscribe anytime on our website.</p>
      <a class="btn" href="${SITE_URL}">Visit FreeReverseColoring</a>
    `);
  } catch (err) {
    console.error('Unsubscribe handler error:', err);
    return htmlResponse(500, 'Error', `
      <h1>Something went wrong</h1>
      <p>We couldn't process your unsubscribe request. Please try clicking the link again, or contact us if the problem persists.</p>
      <a class="btn" href="${SITE_URL}">Go to FreeReverseColoring</a>
    `);
  }
}
