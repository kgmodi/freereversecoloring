/**
 * export-designs.mjs
 *
 * Exports design data from DynamoDB (frc-designs table) and downloads
 * corresponding images from S3 (frc-content-186669525308 bucket) into
 * the website's public directory. Writes a JSON manifest that the
 * Next.js static build reads at build time.
 *
 * Output:
 *   - website/public/designs/{slug}.png   (one image per design)
 *   - website/src/data/designs.json       (metadata array)
 *
 * Prerequisites:
 *   - AWS credentials configured for us-east-1
 *   - frc-designs DynamoDB table deployed
 *   - frc-content-186669525308 S3 bucket with design images
 *
 * Usage:
 *   node scripts/export-designs.mjs
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const WEBSITE_DIR = join(PROJECT_ROOT, 'website');

const REGION = 'us-east-1';
const TABLE_NAME = 'frc-designs';
const BUCKET_NAME = 'frc-content-186669525308';

const DESIGNS_PUBLIC_DIR = join(WEBSITE_DIR, 'public', 'designs');
const DESIGNS_JSON_PATH = join(WEBSITE_DIR, 'src', 'data', 'designs.json');

/**
 * Unmarshall a DynamoDB item into a plain JS object.
 * Handles S, N, BOOL, L (of S), and NULL types.
 */
function unmarshall(item) {
  const result = {};
  for (const [key, value] of Object.entries(item)) {
    if ('S' in value) result[key] = value.S;
    else if ('N' in value) result[key] = Number(value.N);
    else if ('BOOL' in value) result[key] = value.BOOL;
    else if ('NULL' in value) result[key] = null;
    else if ('L' in value) {
      result[key] = value.L.map((v) => {
        if ('S' in v) return v.S;
        if ('N' in v) return Number(v.N);
        if ('BOOL' in v) return v.BOOL;
        return v;
      });
    } else if ('M' in value) {
      result[key] = unmarshall(value.M);
    }
  }
  return result;
}

/**
 * Stream an S3 object body to a Buffer.
 */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function main() {
  console.log('=== FreeReverseColoring Design Export ===\n');

  // 1. Scan DynamoDB for all designs
  const dynamo = new DynamoDBClient({ region: REGION });
  console.log(`Scanning DynamoDB table: ${TABLE_NAME} ...`);

  let items = [];
  let lastKey = undefined;

  do {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
    });
    const result = await dynamo.send(command);
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`  Found ${items.length} design(s)\n`);

  if (items.length === 0) {
    console.log('No designs found. Writing empty array.');
    await mkdir(dirname(DESIGNS_JSON_PATH), { recursive: true });
    await writeFile(DESIGNS_JSON_PATH, JSON.stringify([], null, 2));
    return;
  }

  // 2. Unmarshall and transform into the shape the website expects
  const designs = items.map((item) => {
    const d = unmarshall(item);
    return {
      designId: d.designId,
      weekId: d.weekId,
      title: d.title,
      description: d.description,
      theme: d.theme,
      slug: d.slug,
      imagePath: `/designs/${d.slug}.png`,
      s3Key: d.s3Key,
      status: d.status,
      difficulty: d.difficulty,
      drawingPrompts: d.drawingPrompts || [],
      colorPalette: d.colorPalette || [],
      tags: d.tags || [],
      isPremium: d.isPremium || false,
      width: d.width,
      height: d.height,
      createdAt: d.createdAt,
    };
  });

  // Sort by createdAt descending (newest first)
  designs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 3. Download images from S3
  const s3 = new S3Client({ region: REGION });
  await mkdir(DESIGNS_PUBLIC_DIR, { recursive: true });

  for (const design of designs) {
    const localPath = join(DESIGNS_PUBLIC_DIR, `${design.slug}.png`);

    if (existsSync(localPath)) {
      console.log(`  [skip] ${design.slug}.png (already exists)`);
      continue;
    }

    console.log(`  [download] ${design.s3Key} -> public/designs/${design.slug}.png`);

    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: design.s3Key,
      });
      const response = await s3.send(command);
      const buffer = await streamToBuffer(response.Body);
      await writeFile(localPath, buffer);
      console.log(`    OK (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err) {
      console.error(`    FAILED: ${err.message}`);
    }
  }

  // 4. Write designs.json (exclude s3Key — not needed by the website)
  const jsonData = designs.map(({ s3Key, ...rest }) => rest);

  await mkdir(dirname(DESIGNS_JSON_PATH), { recursive: true });
  await writeFile(DESIGNS_JSON_PATH, JSON.stringify(jsonData, null, 2));

  console.log(`\nWrote ${designs.length} design(s) to:`);
  console.log(`  ${DESIGNS_JSON_PATH}`);
  console.log(`  ${DESIGNS_PUBLIC_DIR}/`);
  console.log('\nDone! Run "cd website && npm run build" to rebuild the site.');
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
