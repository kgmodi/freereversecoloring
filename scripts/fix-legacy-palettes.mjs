#!/usr/bin/env node
/**
 * Extract dominant colors from legacy design images and update
 * DynamoDB + designs.json with accurate color palettes.
 *
 * Uses sharp to resize images to a small sample, then k-means-ish
 * color clustering to find the 5 most dominant colors.
 */

import sharp from 'sharp';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESIGNS_DIR = join(__dirname, '..', 'website', 'public', 'designs');
const DESIGNS_JSON = join(__dirname, '..', 'website', 'src', 'data', 'designs.json');

const REGION = 'us-east-1';
const DESIGNS_TABLE = 'frc-designs';

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);

// Simple color distance (Euclidean in RGB space)
function colorDist(a, b) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

// Convert RGB array to hex string
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract dominant colors from an image using pixel sampling + clustering.
 * Returns array of 5 hex color strings.
 */
async function extractDominantColors(imagePath) {
  // Resize to 50x50 for fast processing
  const { data, info } = await sharp(imagePath)
    .resize(50, 50, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Collect all pixels as [R, G, B]
  const pixels = [];
  for (let i = 0; i < data.length; i += 3) {
    pixels.push([data[i], data[i+1], data[i+2]]);
  }

  // Simple k-means clustering with 5 centers
  const k = 5;
  // Initialize centers by picking evenly spaced pixels
  let centers = [];
  const step = Math.floor(pixels.length / k);
  for (let i = 0; i < k; i++) {
    centers.push([...pixels[i * step]]);
  }

  // Run 20 iterations of k-means
  for (let iter = 0; iter < 20; iter++) {
    const clusters = Array.from({ length: k }, () => []);

    // Assign each pixel to nearest center
    for (const px of pixels) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let c = 0; c < k; c++) {
        const d = colorDist(px, centers[c]);
        if (d < minDist) { minDist = d; minIdx = c; }
      }
      clusters[minIdx].push(px);
    }

    // Recalculate centers
    for (let c = 0; c < k; c++) {
      if (clusters[c].length === 0) continue;
      centers[c] = [
        Math.round(clusters[c].reduce((s, p) => s + p[0], 0) / clusters[c].length),
        Math.round(clusters[c].reduce((s, p) => s + p[1], 0) / clusters[c].length),
        Math.round(clusters[c].reduce((s, p) => s + p[2], 0) / clusters[c].length),
      ];
    }
  }

  // Sort by brightness (dark to light) for a pleasant display order
  centers.sort((a, b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));

  return centers.map(c => rgbToHex(c[0], c[1], c[2]));
}

async function main() {
  // Load designs.json
  const designs = JSON.parse(readFileSync(DESIGNS_JSON, 'utf-8'));

  // Find legacy designs with grey fallback palettes
  const GREY_PALETTE = ['#808080', '#A0A0A0', '#606060', '#C0C0C0', '#404040'];
  const legacyDesigns = designs.filter(d =>
    d.designId?.startsWith('design-legacy') &&
    JSON.stringify(d.colorPalette) === JSON.stringify(GREY_PALETTE)
  );

  console.log(`Found ${legacyDesigns.length} legacy designs with grey fallback palettes\n`);

  // Also scan DynamoDB for the matching records
  const scanResult = await dynamoClient.send(new ScanCommand({
    TableName: DESIGNS_TABLE,
    FilterExpression: 'begins_with(designId, :prefix)',
    ExpressionAttributeValues: { ':prefix': 'design-legacy' },
  }));
  const ddbDesigns = new Map(scanResult.Items.map(d => [d.slug, d]));

  let updated = 0;

  for (const design of legacyDesigns) {
    const imgPath = join(DESIGNS_DIR, `${design.slug}.png`);
    try {
      const palette = await extractDominantColors(imgPath);
      console.log(`  ${design.title}`);
      console.log(`    ${palette.join(', ')}`);

      // Update designs.json in memory
      const idx = designs.findIndex(d => d.designId === design.designId);
      if (idx >= 0) designs[idx].colorPalette = palette;

      // Update DynamoDB
      const ddbRecord = ddbDesigns.get(design.slug);
      if (ddbRecord) {
        await dynamoClient.send(new UpdateCommand({
          TableName: DESIGNS_TABLE,
          Key: { designId: ddbRecord.designId, weekId: ddbRecord.weekId },
          UpdateExpression: 'SET colorPalette = :palette',
          ExpressionAttributeValues: { ':palette': palette },
        }));
      }

      updated++;
    } catch (err) {
      console.error(`  FAILED: ${design.slug}: ${err.message}`);
    }
  }

  // Write updated designs.json
  writeFileSync(DESIGNS_JSON, JSON.stringify(designs, null, 2));

  console.log(`\nUpdated ${updated} designs in DynamoDB + designs.json`);
  console.log('Rebuild and deploy the website to see changes.');
}

main().catch(err => { console.error(err); process.exit(1); });
