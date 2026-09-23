/** Several screenshots of one share, and the links they show */
import { suite, equal, check } from './harness';
import { imagesFrom, sniffImageType } from '../src/lib/captureInput';
import { processCapture } from '../src/lib/captureProcess';
import type { AiKey } from '../src/lib/aiImport';

const JPEG = '/9j/4AAQSkZJRgABAQ';
const PNG = 'iVBORw0KGgoAAAANSUhEUg';

const RECIPE_PAGE = `<!DOCTYPE html><html><head><title>Corn Kakiage</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Corn Kakiage","recipeIngredient":["2 ears corn","60 g flour","60 ml ice water","oil for frying"],"recipeInstructions":[{"@type":"HowToStep","text":"Cut the corn off the cob and mix with flour and ice water."},{"@type":"HowToStep","text":"Fry spoonfuls in hot oil until crisp, 3 minutes."}]}</script>
</head><body></body></html>`;

/** A model that sees a comment with a link and no recipe. */
const MODEL_ANSWER = {
    content: [{ type: 'text', text: JSON.stringify({
        title: 'Corn Kakiage', description: '', category: '', nationality: '',
        servings: null, prepMinutes: null, cookMinutes: null,
        ingredients: [], instructions: '', links: ['pattyplates.com/corn-kakiage'],
    }) }],
    usage: { input_tokens: 3000, output_tokens: 80 },
};

export default async function screenshotsTests() {
    suite('screenshots: what a Shortcut sends');
    equal('the type from the first bytes', [sniffImageType(JPEG), sniffImageType(PNG)], ['image/jpeg', 'image/png']);
    const joined = imagesFrom({ images: `${JPEG},\n${PNG}\n,data:image/jpeg;base64,${JPEG}` });
    equal('joined with commas, line breaks ignored, a data URL head skipped', joined.map((image) => image.mediaType), ['image/jpeg', 'image/png', 'image/jpeg']);
    equal('the single picture comes first', imagesFrom({ image: { base64: PNG, mediaType: 'image/png' }, images: [{ base64: JPEG, mediaType: 'image/jpeg' }] }).length, 2);
    const now = new Date('2026-09-23T15:05:00+02:00');
    const dated = imagesFrom({ images: `2026-09-23T15:03:10+02:00|${JPEG},2026-09-22T09:00:00+02:00|${PNG},2026-09-23T15:04:00+02:00|${PNG}` }, now);
    equal('with their time: the one from yesterday is left out', dated.map((image) => image.mediaType), ['image/jpeg', 'image/png']);
    equal('a time that cannot be read keeps the picture', imagesFrom({ images: `gestern|${JPEG}` }, now).length, 1);
    equal('at most four', imagesFrom({ images: [JPEG, JPEG, JPEG, JPEG, JPEG, JPEG].join(',') }).length, 4);

    suite('screenshots: read together, the link followed');
    const sent: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const at = typeof input === 'string' ? input : input.toString();
        if (at.includes('api.anthropic.com')) {
            sent.push(String(init?.body ?? ''));
            return { ok: true, status: 200, url: at, headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify(MODEL_ANSWER), json: async () => MODEL_ANSWER } as unknown as Response;
        }
        if (at.startsWith('https://blob.example/')) {
            const bytes = Buffer.from(JPEG, 'base64');
            return { ok: true, status: 200, url: at, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), text: async () => '' } as unknown as Response;
        }
        const page = at === 'https://pattyplates.com/corn-kakiage' ? RECIPE_PAGE : '';
        return { ok: page !== '', status: page ? 200 : 404, url: at, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), text: async () => page, arrayBuffer: async () => new TextEncoder().encode(page).buffer, json: async () => ({}) } as unknown as Response;
    }) as typeof globalThis.fetch;

    try {
        const key: AiKey = { provider: 'anthropic', apiKey: 'test', model: null };
        const read = await processCapture(
            { kind: 'image', source: 'photo', sourceUrl: null, rawText: null, imageUrl: 'https://blob.example/post.jpg', moreImageUrls: ['https://blob.example/comments.jpg'] },
            { mode: 'images', keys: [key] }
        );
        equal('one call for both screenshots', sent.length, 1);
        const body = JSON.parse(sent[0] ?? '{}');
        const images = (body.messages?.[0]?.content ?? []).filter((part: { type: string }) => part.type === 'image');
        equal('with both pictures in it', images.length, 2);
        equal('the recipe from the link the comment showed', read.draft?.title, 'Corn Kakiage');
        equal('complete', read.status, 'ready');
        check('the link list is not part of the draft', !('links' in (read.draft ?? {})));
    } finally {
        globalThis.fetch = realFetch;
    }
}
