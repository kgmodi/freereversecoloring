#!/usr/bin/env node
/**
 * Import legacy designs from ReverseColoringAppAI into DynamoDB + S3.
 *
 * Reads JSON descriptions + PNG images from the old local pipeline,
 * creates DynamoDB records in frc-designs, and uploads images to the
 * S3 content bucket. Only imports designs that have both a JSON file
 * and a matching PNG image.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { createHash, randomBytes } from 'crypto';

const REGION = 'us-east-1';
const DESIGNS_TABLE = 'frc-designs';
const CONTENT_BUCKET = 'frc-content-186669525308';
const AI_DIR = join(import.meta.dirname, '..', 'ReverseColoringAppAI');

const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const s3Client = new S3Client({ region: REGION });

// Theme mapping from themes.json
const THEMES = {
  1: 'ocean_life',
  2: 'tropical_forest',
  3: 'desert_landscapes',
  4: 'cityscapes_at_night',
  5: 'mountain_ranges',
  6: 'wildlife',
  7: 'floral_gardens',
  8: 'oceanic_reefs',
  9: 'abstract_art',
  10: 'space_and_galaxies',
  11: 'famous_landmarks',
  12: 'seasonal_scenery',
};

// Difficulty based on week themes
const DIFFICULTY_MAP = {
  1: 'easy',       // Ocean Life - intro week
  2: 'medium',     // Tropical Forest
  3: 'medium',     // Desert Landscapes
  4: 'advanced',   // Cityscapes at Night
  5: 'medium',     // Mountain Ranges
  6: 'advanced',   // Wildlife
  7: 'easy',       // Floral Gardens
  8: 'medium',     // Oceanic Reefs
  9: 'advanced',   // Abstract Art
  10: 'advanced',  // Space and Galaxies
  11: 'medium',    // Famous Landmarks
  12: 'medium',    // Seasonal Scenery
};

// These were generated around May 2024
function weekCreatedAt(weekNum) {
  // Spread across April-May 2024 (original generation period)
  const base = new Date('2024-04-01T12:00:00Z');
  base.setDate(base.getDate() + (weekNum - 1) * 7);
  return base.toISOString();
}

// Convert week number (1-12) to ISO week ID (2024-WXX)
function weekId(weekNum) {
  // These were generated starting April 2024 = roughly W14+
  return `2024-W${String(13 + weekNum).padStart(2, '0')}`;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateDesignId() {
  const ts = Date.now().toString(36);
  const rand = randomBytes(4).toString('hex');
  return `design-legacy-${ts}-${rand}`;
}

// Extract drawing prompts from the JSON metadata
function extractPrompts(data) {
  const prompts = [];
  if (data.subject_matter) {
    if (data.subject_matter.flora_and_fauna) {
      prompts.push(...data.subject_matter.flora_and_fauna.slice(0, 1));
    }
    if (data.subject_matter.water_effects) {
      prompts.push(...data.subject_matter.water_effects.slice(0, 1));
    }
    // Check for other subject_matter keys
    for (const [key, val] of Object.entries(data.subject_matter)) {
      if (Array.isArray(val) && !['flora_and_fauna', 'water_effects'].includes(key)) {
        prompts.push(...val.slice(0, 1));
      }
    }
  }
  // Fallback generic prompts
  if (prompts.length === 0) {
    prompts.push(
      `Draw outlines on the color regions to reveal hidden shapes`,
      `Add details and patterns following the color boundaries`,
      `Create your own interpretation of the scene`,
    );
  }
  return prompts.slice(0, 3);
}

// Convert color names to a simple palette (hex approximations)
const COLOR_NAME_TO_HEX = {
  'deep blue': '#003366', 'turquoise': '#40E0D0', 'bright coral': '#FF6F61',
  'seafoam green': '#93E9BE', 'marine teal': '#007B7F', 'sandy beige': '#F5DEB3',
  'emerald green': '#50C878', 'moss green': '#8A9A5B', 'bright yellow-green': '#ADFF2F',
  'deep forest green': '#0B3D0B', 'olive': '#808000', 'light sage': '#BCB88A',
  'dark navy': '#000080', 'warm amber': '#FFBF00', 'soft lavender': '#E6E6FA',
  'deep charcoal': '#333333', 'electric cyan': '#00FFFF', 'pale cream': '#FFFDD0',
  'warm brown': '#964B00', 'tawny orange': '#CD853F', 'pale gold': '#EEE8AA',
  'deep chocolate': '#3B1F0B', 'misty gray': '#B0B0B0', 'earthy sienna': '#A0522D',
  'crimson red': '#DC143C', 'bright pink': '#FF69B4', 'soft rose': '#FFB6C1',
  'deep rose': '#C21E56', 'light blush': '#FFE4E1', 'warm peach': '#FFDAB9',
  'cobalt blue': '#0047AB', 'cerulean': '#007BA7', 'aquamarine': '#7FFFD4',
  'deep indigo': '#4B0082', 'bright purple': '#A020F0', 'soft periwinkle': '#CCCCFF',
  'pastel blue': '#AEC6CF', 'fiery orange': '#FF4500', 'sunset pink': '#FF6B6B',
  'golden yellow': '#FFD700', 'deep violet': '#9400D3', 'soft mint': '#98FB98',
  'crimson': '#DC143C', 'magenta': '#FF00FF', 'royal blue': '#4169E1',
  'forest green': '#228B22', 'midnight blue': '#191970', 'sky blue': '#87CEEB',
};

function extractColorPalette(data) {
  const colors = [];
  if (data.color_palette) {
    const allColors = [
      ...(data.color_palette.primary_colors || []),
      ...(data.color_palette.secondary_colors || []),
    ];
    for (const name of allColors.slice(0, 5)) {
      const lower = name.toLowerCase().trim();
      colors.push(COLOR_NAME_TO_HEX[lower] || '#808080');
    }
  }
  return colors.length > 0 ? colors : ['#808080', '#A0A0A0', '#606060', '#C0C0C0', '#404040'];
}

function extractTags(data, weekNum) {
  const tags = [];
  const theme = THEMES[weekNum] || '';
  tags.push(...theme.split('_'));
  tags.push('legacy', 'watercolor');
  if (data.color_palette?.primary_colors) {
    tags.push(...data.color_palette.primary_colors.slice(0, 2).map(c => c.split(' ').pop()));
  }
  return [...new Set(tags)].slice(0, 7);
}

async function s3KeyExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: CONTENT_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const imageDir = join(AI_DIR, 'images');
  const dataDir = join(AI_DIR, 'data');

  const weekDirs = readdirSync(imageDir)
    .filter(d => d.startsWith('week-') && d !== 'week-0')
    .sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));

  let imported = 0;
  let skipped = 0;

  for (const weekDir of weekDirs) {
    const weekNum = parseInt(weekDir.split('-')[1]);
    const imgPath = join(imageDir, weekDir);
    const jsonPath = join(dataDir, weekDir);

    const images = readdirSync(imgPath).filter(f => f.endsWith('.png'));

    for (const imgFile of images) {
      const title = basename(imgFile, '.png');
      const jsonFile = join(jsonPath, `${title}.json`);

      // Skip images without matching JSON (variants like -1, -2)
      if (!existsSync(jsonFile)) {
        console.log(`  SKIP (no JSON): ${weekDir}/${imgFile}`);
        skipped++;
        continue;
      }

      const data = JSON.parse(readFileSync(jsonFile, 'utf-8'));
      const slug = slugify(title);
      const designId = generateDesignId();
      const wId = weekId(weekNum);
      const s3Key = `designs/${wId}/${slug}.png`;

      // Upload image to S3 content bucket
      const exists = await s3KeyExists(s3Key);
      if (!exists) {
        const imageBuffer = readFileSync(join(imgPath, imgFile));
        await s3Client.send(new PutObjectCommand({
          Bucket: CONTENT_BUCKET,
          Key: s3Key,
          Body: imageBuffer,
          ContentType: 'image/png',
        }));
        console.log(`  S3: uploaded ${s3Key}`);
      } else {
        console.log(`  S3: already exists ${s3Key}`);
      }

      // Create DynamoDB record
      const item = {
        designId,
        weekId: wId,
        title: data.title || title,
        description: data.concept_description || data.intended_impact || '',
        theme: THEMES[weekNum] || 'unknown',
        slug,
        imagePath: `/designs/${slug}.png`,
        status: 'approved',
        approvedAt: weekCreatedAt(weekNum),
        difficulty: DIFFICULTY_MAP[weekNum] || 'medium',
        drawingPrompts: extractPrompts(data),
        colorPalette: extractColorPalette(data),
        tags: extractTags(data, weekNum),
        isPremium: false,
        width: 1024,
        height: 1536,
        createdAt: weekCreatedAt(weekNum),
        legacy: true,
      };

      await dynamoClient.send(new PutCommand({
        TableName: DESIGNS_TABLE,
        Item: item,
      }));

      console.log(`  DDB: ${wId} — "${data.title}" (${designId})`);
      imported++;
    }
  }

  console.log(`\nDone. Imported: ${imported}, Skipped: ${skipped}`);
  console.log(`\nNext: run 'node scripts/export-designs.mjs' to sync to website.`);
}

main().catch(err => { console.error(err); process.exit(1); });
