/**
 * frc-approve-content-handler
 *
 * Handles admin approve/reject actions for generated designs.
 *
 * Routes:
 *   GET /api/admin/approve?designId=X&weekId=Y&action=approve&token=Z
 *   GET /api/admin/approve?designId=X&weekId=Y&action=reject&token=Z
 *   GET /api/admin/approve?weekId=Y&action=approve-all&token=Z
 *
 * Returns an HTML page confirming the action.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const DESIGNS_TABLE = process.env.DESIGNS_TABLE!;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN!;
const SITE_URL = process.env.SITE_URL!;

interface APIGatewayEvent {
  httpMethod: string;
  queryStringParameters: Record<string, string> | null;
}

function htmlResponse(statusCode: number, title: string, body: string) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — FreeReverseColoring Admin</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; background: #F7FAFC; color: #2D3748; }
  h1 { color: #6B46C1; }
  .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin: 16px 0; }
  a { color: #6B46C1; }
  .success { color: #276749; }
  .reject { color: #9B2C2C; }
</style>
</head>
<body>${body}</body></html>`,
  };
}

export async function handler(event: APIGatewayEvent) {
  const params = event.queryStringParameters || {};
  const { designId, weekId, action, token } = params;

  // Auth check
  if (!token || token !== ADMIN_TOKEN) {
    return htmlResponse(403, 'Unauthorized', '<h1>Unauthorized</h1><p>Invalid admin token.</p>');
  }

  if (!action || !weekId) {
    return htmlResponse(400, 'Bad Request', '<h1>Bad Request</h1><p>Missing action or weekId.</p>');
  }

  try {
    if (action === 'approve-all') {
      // Approve all pending_review designs for this week
      const designs = await getDesignsForWeek(weekId);
      const pending = designs.filter((d) => d.status === 'pending_review');

      for (const design of pending) {
        await updateDesignStatus(design.designId, weekId, 'approved');
      }

      return htmlResponse(200, 'All Approved',
        `<div class="card">
          <h1 class="success">All Designs Approved</h1>
          <p>Approved <strong>${pending.length}</strong> designs for <strong>${weekId}</strong>.</p>
          <p>These will be included in the next weekly email.</p>
          <p><a href="${SITE_URL}/gallery">View Gallery</a></p>
        </div>`);

    } else if (action === 'approve' && designId) {
      await updateDesignStatus(designId, weekId, 'approved');

      return htmlResponse(200, 'Design Approved',
        `<div class="card">
          <h1 class="success">Design Approved</h1>
          <p><strong>${designId}</strong> has been approved for <strong>${weekId}</strong>.</p>
          <p><a href="${SITE_URL}/gallery">View Gallery</a></p>
        </div>`);

    } else if (action === 'reject' && designId) {
      await updateDesignStatus(designId, weekId, 'rejected');

      return htmlResponse(200, 'Design Rejected',
        `<div class="card">
          <h1 class="reject">Design Rejected</h1>
          <p><strong>${designId}</strong> has been rejected for <strong>${weekId}</strong>.</p>
        </div>`);

    } else {
      return htmlResponse(400, 'Bad Request', '<h1>Bad Request</h1><p>Invalid action. Use approve, reject, or approve-all.</p>');
    }
  } catch (err) {
    console.error('[handler] Error:', err);
    return htmlResponse(500, 'Error', `<h1>Error</h1><p>${(err as Error).message}</p>`);
  }
}

async function getDesignsForWeek(weekId: string) {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: DESIGNS_TABLE,
      IndexName: 'WeekStatusIndex',
      KeyConditionExpression: 'weekId = :weekId',
      ExpressionAttributeValues: { ':weekId': weekId },
    }),
  );
  return (result.Items ?? []) as Array<{ designId: string; weekId: string; status: string }>;
}

async function updateDesignStatus(designId: string, weekId: string, status: string) {
  const now = new Date().toISOString();
  const updateExpr = status === 'approved'
    ? 'SET #s = :status, approvedAt = :now'
    : 'SET #s = :status';

  await dynamoClient.send(
    new UpdateCommand({
      TableName: DESIGNS_TABLE,
      Key: { designId, weekId },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ...(status === 'approved' ? { ':now': now } : {}),
      },
    }),
  );
}
