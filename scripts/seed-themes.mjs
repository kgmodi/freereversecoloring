/**
 * seed-themes.mjs
 *
 * Generates 52 weeks of themed reverse coloring page ideas using GPT-4o,
 * then batch-writes them to the frc-theme-backlog DynamoDB table.
 *
 * Prerequisites:
 *   - OpenAI API key stored in AWS Secrets Manager at frc/openai-api-key
 *   - DynamoDB table frc-theme-backlog deployed (via CDK)
 *   - AWS credentials configured for us-east-1
 *
 * Usage:
 *   node seed-themes.mjs
 *
 * Idempotent: will abort if the table already has items.
 */

import { DynamoDBClient, ScanCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import OpenAI from 'openai';
import { ulid } from 'ulid';

const REGION = 'us-east-1';
const TABLE_NAME = 'frc-theme-backlog';
const SECRET_ID = 'frc/openai-api-key';

// The 12 themes already used in ReverseColoringAppAI/data/themes.json.
// These will be seeded with status=used and their original week number.
const EXISTING_THEMES = [
  { week: 1,  theme: 'ocean_life',        description: 'Vibrant underwater scenes featuring sea creatures, coral formations, and dappled light filtering through water.' },
  { week: 2,  theme: 'tropical_forest',   description: 'Lush, dense layers of tropical foliage with rich greens, exotic birds, and hanging vines.' },
  { week: 3,  theme: 'desert_landscapes',  description: 'Subtle beauty of desert colors — sandy dunes, terracotta mesas, and golden-hour skies.' },
  { week: 4,  theme: 'cityscapes_at_night', description: 'Bright city lights and dark shadows — glowing windows, neon reflections on wet streets, silhouetted skylines.' },
  { week: 5,  theme: 'mountain_ranges',    description: 'Majestic towering peaks, misty valleys, alpine meadows, and snow-capped summits.' },
  { week: 6,  theme: 'wildlife',           description: 'Intricate animal patterns — feathers, fur, scales — set against their natural habitats.' },
  { week: 7,  theme: 'floral_gardens',     description: 'Intricate details of various flowers — petals, stamens, and leaves in full bloom.' },
  { week: 8,  theme: 'oceanic_reefs',      description: 'Detailed coral reefs bustling with marine life — anemones, clownfish, and sea fans.' },
  { week: 9,  theme: 'abstract_art',       description: 'Free-flowing abstract patterns, swirls, and color gradients without representational imagery.' },
  { week: 10, theme: 'space_and_galaxies', description: 'Stars, nebulae, spiral galaxies, and cosmic dust clouds in deep purples, blues, and golds.' },
  { week: 11, theme: 'famous_landmarks',   description: 'Iconic world landmarks — Eiffel Tower, Taj Mahal, Golden Gate Bridge — rendered in watercolor washes.' },
  { week: 12, theme: 'seasonal_scenery',   description: 'The distinct colors of four seasons — cherry blossoms, summer meadows, autumn leaves, snowy pines.' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOpenAIKey() {
  const client = new SecretsManagerClient({ region: REGION });
  const resp = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
  return resp.SecretString;
}

async function checkTableEmpty(dynamo) {
  const resp = await dynamo.send(new ScanCommand({
    TableName: TABLE_NAME,
    Select: 'COUNT',
    Limit: 1,
  }));
  return resp.Count === 0;
}

/**
 * Call GPT-4o to generate 40 new themes (seasonal balance: ~10 per season + ~12 any).
 * Uses structured JSON output to ensure clean parsing.
 */
async function generateNewThemes(openai) {
  const existingThemeList = EXISTING_THEMES.map(t => t.theme).join(', ');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.9,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'theme_backlog',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            themes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  theme: {
                    type: 'string',
                    description: 'Short snake_case identifier, e.g. autumn_forest, cherry_blossoms'
                  },
                  description: {
                    type: 'string',
                    description: '2-3 sentences describing the theme for an AI watercolor image generator. Focus on colors, mood, and visual elements.'
                  },
                  season: {
                    type: 'string',
                    enum: ['spring', 'summer', 'autumn', 'winter', 'any']
                  },
                  priority: {
                    type: 'integer',
                    description: 'Priority 1-5. 1=highest for seasonal themes that must run in their season, 5=lowest for any-time themes.'
                  }
                },
                required: ['theme', 'description', 'season', 'priority'],
                additionalProperties: false
              }
            }
          },
          required: ['themes'],
          additionalProperties: false
        }
      }
    },
    messages: [
      {
        role: 'system',
        content: `You are a creative director for a reverse coloring page newsletter. Reverse coloring pages are pre-colored watercolor backgrounds where users draw their own outlines on top. Your job is to design 40 unique weekly themes that inspire beautiful, printable watercolor backgrounds.`
      },
      {
        role: 'user',
        content: `Generate exactly 40 unique reverse coloring page themes. Each theme should be distinct and inspire a beautiful watercolor background that people can print and draw outlines on.

Requirements:
- Each theme needs a short snake_case identifier (e.g. "autumn_forest", "cherry_blossoms", "northern_lights")
- Each theme needs a 2-3 sentence description focusing on colors, mood, and visual elements for an AI image generator
- Seasonal balance: exactly 8 spring themes, 8 summer themes, 8 autumn themes, 8 winter themes, and 8 "any" season themes
- Priority 1-2 for strongly seasonal themes (must run in their season), 3 for mildly seasonal, 4-5 for any-time themes
- Themes must be visually distinct from each other
- Do NOT include any of these already-used themes: ${existingThemeList}
- Think about what makes great reverse coloring pages: soft watercolor washes, interesting shapes to outline, varied color palettes

Aim for a mix of:
- Nature scenes (forests, beaches, gardens, weather)
- Cultural/architectural (markets, temples, bridges, festivals)
- Animals and creatures
- Abstract and artistic (mandalas, patterns, textures)
- Seasonal activities and holidays
- Food and botanicals`
      }
    ]
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  return parsed.themes;
}

/**
 * Build the full list of 52 DynamoDB items — 12 existing (used) + 40 new (available).
 */
function buildItems(newThemes) {
  const now = new Date().toISOString();
  const items = [];

  // 12 existing themes marked as "used"
  for (const t of EXISTING_THEMES) {
    items.push({
      themeId:     { S: ulid() },
      createdAt:   { S: now },
      theme:       { S: t.theme },
      description: { S: t.description },
      season:      { S: 'any' }, // original themes were not season-tagged
      usedInWeek:  { N: String(t.week) },
      status:      { S: 'used' },
      priority:    { N: '3' },
    });
  }

  // 40 new themes marked as "available"
  for (const t of newThemes) {
    items.push({
      themeId:     { S: ulid() },
      createdAt:   { S: now },
      theme:       { S: t.theme },
      description: { S: t.description },
      season:      { S: t.season },
      usedInWeek:  { NULL: true },
      status:      { S: 'available' },
      priority:    { N: String(t.priority) },
    });
  }

  return items;
}

/**
 * Batch-write items to DynamoDB in chunks of 25 (the BatchWriteItem limit).
 */
async function batchWriteItems(dynamo, items) {
  const BATCH_SIZE = 25;
  let written = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const requests = batch.map(item => ({
      PutRequest: { Item: item }
    }));

    let unprocessed = { [TABLE_NAME]: requests };

    // Retry loop for unprocessed items (exponential backoff)
    let retries = 0;
    while (unprocessed[TABLE_NAME] && unprocessed[TABLE_NAME].length > 0) {
      if (retries > 0) {
        const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000);
        console.log(`  Retrying ${unprocessed[TABLE_NAME].length} unprocessed items after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const resp = await dynamo.send(new BatchWriteItemCommand({
        RequestItems: unprocessed
      }));

      const processed = (unprocessed[TABLE_NAME]?.length || 0) -
                        (resp.UnprocessedItems?.[TABLE_NAME]?.length || 0);
      written += processed;

      unprocessed = resp.UnprocessedItems || {};
      retries++;

      if (retries > 5) {
        throw new Error(`Failed to write batch after 5 retries. ${unprocessed[TABLE_NAME]?.length || 0} items remain unprocessed.`);
      }
    }

    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)} written (${written} total)`);
  }

  return written;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FreeReverseColoring Theme Backlog Seeder ===\n');

  // 1. Check idempotency — abort if table already has data
  const dynamo = new DynamoDBClient({ region: REGION });
  const isEmpty = await checkTableEmpty(dynamo);
  if (!isEmpty) {
    console.log('Table already has items. Aborting to prevent duplicates.');
    console.log('To re-seed, manually delete all items first.');
    process.exit(0);
  }
  console.log('[1/5] Table is empty — safe to seed.\n');

  // 2. Get OpenAI API key from Secrets Manager
  console.log('[2/5] Fetching OpenAI API key from Secrets Manager...');
  const apiKey = await getOpenAIKey();
  const openai = new OpenAI({ apiKey });
  console.log('  API key retrieved.\n');

  // 3. Generate 40 new themes via GPT-4o
  console.log('[3/5] Generating 40 new themes via GPT-4o (this may take 15-30 seconds)...');
  const newThemes = await generateNewThemes(openai);

  if (newThemes.length !== 40) {
    console.warn(`  WARNING: Expected 40 themes, got ${newThemes.length}. Proceeding anyway.`);
  }

  // Validate seasonal distribution
  const seasonCounts = {};
  for (const t of newThemes) {
    seasonCounts[t.season] = (seasonCounts[t.season] || 0) + 1;
  }
  console.log(`  Generated ${newThemes.length} themes.`);
  console.log(`  Season distribution: ${JSON.stringify(seasonCounts)}`);

  // Log theme names
  console.log('  Themes:');
  for (const t of newThemes) {
    console.log(`    ${t.season.padEnd(8)} [P${t.priority}] ${t.theme}`);
  }
  console.log();

  // 4. Build DynamoDB items (12 existing + 40 new = 52)
  console.log('[4/5] Building 52 DynamoDB items...');
  const items = buildItems(newThemes);
  console.log(`  Built ${items.length} items (12 used + ${newThemes.length} available).\n`);

  // 5. Batch-write to DynamoDB
  console.log(`[5/5] Batch-writing ${items.length} items to ${TABLE_NAME}...`);
  const totalWritten = await batchWriteItems(dynamo, items);
  console.log(`\nDone! ${totalWritten} items written to ${TABLE_NAME}.`);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Total items:   ${totalWritten}`);
  console.log(`  Status=used:   12 (original themes from 2024)`);
  console.log(`  Status=avail:  ${totalWritten - 12}`);
  console.log(`  Seasons:       ${JSON.stringify(seasonCounts)}`);
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
