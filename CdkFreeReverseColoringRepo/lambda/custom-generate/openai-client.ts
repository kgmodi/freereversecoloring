/**
 * OpenAI SDK wrapper for Custom Reverse Coloring Page Generator.
 *
 * Reuses the same Secrets Manager caching pattern from generate-content.
 * Generates a single design description + image based on user prompt.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Secrets Manager — cache API key per Lambda cold start
// ---------------------------------------------------------------------------

const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });

let cachedApiKey: string | null = null;

async function getOpenAIApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const secretArn = process.env.OPENAI_SECRET_ARN;
  if (!secretArn) {
    throw new Error('OPENAI_SECRET_ARN environment variable is not set');
  }

  console.log('[openai-client] Fetching OpenAI API key from Secrets Manager');
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  if (!response.SecretString) {
    throw new Error('OpenAI API key secret has no string value');
  }

  cachedApiKey = response.SecretString;
  console.log('[openai-client] OpenAI API key retrieved and cached');
  return cachedApiKey;
}

// ---------------------------------------------------------------------------
// Lazy-initialised OpenAI client
// ---------------------------------------------------------------------------

let openaiClient: OpenAI | null = null;

async function getClient(): Promise<OpenAI> {
  if (openaiClient) return openaiClient;
  const apiKey = await getOpenAIApiKey();
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomDesignDescription {
  title: string;
  slug: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'advanced';
  drawingPrompts: string[];
  tags: string[];
  colorPalette: string[];
  generationPrompt: string;
}

interface GPT4oCustomDesignResponse {
  design: CustomDesignDescription;
}

// ---------------------------------------------------------------------------
// generateCustomDesignDescription — GPT-4o structured JSON for one design
// ---------------------------------------------------------------------------

export async function generateCustomDesignDescription(
  userPrompt: string,
): Promise<CustomDesignDescription> {
  const client = await getClient();

  console.log(
    `[openai-client] Generating custom design description for: "${userPrompt}"`,
  );

  const systemPrompt = `You are a creative director for FreeReverseColoring, an AI-powered reverse coloring page platform.
Reverse coloring pages are pre-colored watercolor backgrounds where users draw their own outlines on top.

A user has requested a custom reverse coloring page. Your job is to interpret their request and create a
compelling watercolor painting concept that will serve as the background.

CRITICAL REQUIREMENTS for the generationPrompt field:
- The painting must have NO outlines, NO text, NO letters, NO words, NO numbers
- Style must be soft watercolor washes with light, airy colors
- Colors should be vibrant enough to be interesting but light enough that hand-drawn outlines will stand out
- The painting must be suitable for printing at 8.5x11 inches
- The composition should have clear areas of color that naturally suggest shapes users could outline
- Avoid photorealistic images — keep it abstract/impressionistic watercolor style

IMPORTANT: The user's request may be vague or specific. Either way, create a beautiful, inspiring design.
If the request is inappropriate, still create a family-friendly watercolor interpretation.`;

  const promptText = `Create a single reverse coloring page design based on this user request: "${userPrompt}"

Provide:
- title: A creative, evocative name (e.g., "Whispers of the Deep", "Morning Meadow Bloom")
- slug: A URL-friendly version of the title (lowercase, hyphens, no special chars)
- description: 2-3 sentences describing the watercolor painting — what colors dominate, what mood it evokes, what shapes emerge from the washes
- difficulty: "easy" (simple color blocks, obvious shapes), "medium" (moderate complexity, some blending), or "advanced" (complex color interactions, subtle shapes)
- drawingPrompts: Array of exactly 3 creative suggestions for what users could draw on top of this background
- tags: Array of 5-8 descriptive tags (lowercase)
- colorPalette: Array of 4-6 hex color codes that dominate the painting
- generationPrompt: The EXACT prompt to pass to an image generation model. Must start with: "Generate an abstract watercolor painting with no outlines, no text, no letters, no words." followed by specific color, composition, and mood instructions based on the user's theme.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'custom_design_description',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            design: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                slug: { type: 'string' },
                description: { type: 'string' },
                difficulty: {
                  type: 'string',
                  enum: ['easy', 'medium', 'advanced'],
                },
                drawingPrompts: {
                  type: 'array',
                  items: { type: 'string' },
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                },
                colorPalette: {
                  type: 'array',
                  items: { type: 'string' },
                },
                generationPrompt: { type: 'string' },
              },
              required: [
                'title',
                'slug',
                'description',
                'difficulty',
                'drawingPrompts',
                'tags',
                'colorPalette',
                'generationPrompt',
              ],
              additionalProperties: false,
            },
          },
          required: ['design'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: promptText },
    ],
    temperature: 0.9,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('GPT-4o returned empty content for custom design description');
  }

  const parsed: GPT4oCustomDesignResponse = JSON.parse(content);

  if (!parsed.design) {
    throw new Error('GPT-4o response missing design object');
  }

  console.log(
    `[openai-client] Generated custom design: "${parsed.design.title}"`,
  );

  return parsed.design;
}

// ---------------------------------------------------------------------------
// generateImage — gpt-image-1 watercolor image generation
// ---------------------------------------------------------------------------

export async function generateImage(
  generationPrompt: string,
): Promise<Buffer> {
  const client = await getClient();

  console.log(
    '[openai-client] Generating image with gpt-image-1 (1024x1536, high quality)',
  );

  const response = await client.images.generate({
    model: 'gpt-image-1',
    prompt: generationPrompt,
    n: 1,
    size: '1024x1536',
    quality: 'high',
  });

  const imageData = response.data[0];

  if (imageData.b64_json) {
    console.log('[openai-client] Image received as base64, decoding');
    return Buffer.from(imageData.b64_json, 'base64');
  }

  throw new Error(
    'gpt-image-1 did not return base64 image data. Unexpected response format.',
  );
}
