import { z } from 'zod';
import type { ParsedRecipe } from './recipeParser';

/**
 * Optional AI-assisted recipe extraction.
 *
 * Everything here is additive: when ANTHROPIC_API_KEY is absent the feature is
 * simply not offered, and paste-and-parse plus URL import keep working. Nothing
 * in the app depends on this module being configured.
 */

export function isAiImportConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

const DEFAULT_MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const aiRecipeSchema = z.object({
    title: z.string().default(''),
    description: z.string().default(''),
    category: z.string().default(''),
    nationality: z.string().default(''),
    ingredients: z
        .array(
            z.object({
                amount: z.string().default(''),
                item: z.string().default(''),
            })
        )
        .default([]),
    instructions: z.string().default(''),
});

export interface AiExtractionResult extends ParsedRecipe {
    category: string;
    nationality: string;
}

const SYSTEM_PROMPT = `You extract recipes into structured data.

Return ONLY a JSON object, no prose and no code fences, with exactly these keys:
{"title": string, "description": string, "category": string, "nationality": string,
 "ingredients": [{"amount": string, "item": string}], "instructions": string}

Rules:
- Keep the language of the source. Do not translate.
- "amount" holds the quantity and unit together, e.g. "200 g", "2 EL", "1/2".
  Leave it as an empty string when the source gives no quantity.
- "item" is the ingredient alone, without the quantity.
- "instructions" is markdown: one numbered list item per step, separated by blank lines.
- "category" is a single word like Breakfast, Lunch, Dinner, Dessert — or "" if unclear.
- "nationality" is the cuisine, e.g. Italian, German — or "" if unclear.
- Never invent ingredients, quantities or steps that are not in the source.
  If something is missing, leave it empty.`;

interface ContentBlock {
    type: string;
    text?: string;
}

function extractJson(text: string): unknown {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

    try {
        return JSON.parse(trimmed);
    } catch {
        // Fall back to the outermost object in the response.
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start === -1 || end <= start) return null;
        try {
            return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
            return null;
        }
    }
}

export type AiSource =
    | { kind: 'text'; text: string }
    | { kind: 'image'; base64: string; mediaType: string };

/**
 * Throws on configuration or API failure; the caller decides how to degrade.
 */
export async function extractRecipeWithAi(source: AiSource): Promise<AiExtractionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('AI import is not configured');

    const content =
        source.kind === 'text'
            ? [
                {
                    type: 'text',
                    text: `Extract the recipe from this text:\n\n${source.text}`,
                },
            ]
            : [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: source.mediaType, data: source.base64 },
                },
                {
                    type: 'text',
                    text: 'Extract the recipe shown in this image.',
                },
            ];

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content }],
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Anthropic API returned ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { content?: ContentBlock[] };
    const text = (payload.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');

    const parsed = aiRecipeSchema.safeParse(extractJson(text));
    if (!parsed.success) {
        throw new Error('The model did not return a usable recipe');
    }

    return {
        ...parsed.data,
        ingredients: parsed.data.ingredients.filter((ingredient) => ingredient.item.trim() !== ''),
    };
}
