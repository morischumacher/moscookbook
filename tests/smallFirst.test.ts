/** "Kleines Modell zuerst": the small model reads a recipe from text, the large one only when it must (work #46) */
import { suite, equal, check } from './harness';
import { complete, extractRecipeWithAi } from '../src/lib/aiImport';
import { smallModelFor, type AiKey } from '../src/lib/aiProviders';

const whole = { title: 'Ofengemüse', description: '', category: '', nationality: '', servings: 2, prepMinutes: null, cookMinutes: null, ingredients: [{ amount: '1', item: 'Zucchini' }, { amount: '200 g', item: 'Feta' }], instructions: '1. Gemüse schneiden.\n\n2. Alles 25 Minuten in den Ofen.', links: [] };
const partial = { ...whole, instructions: '' };
const none = { ...whole, title: '', ingredients: [], instructions: '' };

/** Answers per model: what the small one says, what the large one says. */
function models(answers: Record<string, unknown>) {
    const original = globalThis.fetch;
    const asked: string[] = [];
    globalThis.fetch = (async (_: unknown, init?: RequestInit) => {
        const model = String((JSON.parse(String(init?.body ?? '{}')) as { model?: string }).model);
        asked.push(model);
        const text = JSON.stringify(answers[model] ?? {});
        return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text }] }), json: async () => ({ content: [{ type: 'text', text }] }) } as unknown as Response;
    }) as typeof globalThis.fetch;
    return { asked, restore: () => void (globalThis.fetch = original) };
}

export default async function smallFirstTests() {
    suite('small model first: when its answer stands');
    check('a whole recipe stands', complete(whole));
    check('so does "no recipe here"', complete(none));
    check('ingredients with no method do not', !complete(partial));

    suite('small model first: which model is asked');
    const key: AiKey = { provider: 'anthropic', apiKey: 'sk-ant-TEST', model: 'claude-sonnet-5', small: 'claude-haiku-4-5' };
    equal('a large model gets a small one to try first', smallModelFor({ ...key, small: undefined }), 'claude-haiku-4-5');
    equal('a small one does not', smallModelFor({ ...key, model: 'claude-haiku-4-5' }), undefined);

    let net = models({ 'claude-haiku-4-5': whole, 'claude-sonnet-5': whole });
    let recipe = await extractRecipeWithAi({ kind: 'text', text: 'Ofengemüse …' }, [key]);
    equal('a good small answer is the answer, and nothing else is asked', [recipe.title, net.asked], ['Ofengemüse', ['claude-haiku-4-5']]);
    net.restore();

    net = models({ 'claude-haiku-4-5': partial, 'claude-sonnet-5': whole });
    recipe = await extractRecipeWithAi({ kind: 'text', text: 'Ofengemüse …' }, [key]);
    equal('an incomplete one is read again by the large model', [recipe.instructions !== '', net.asked], [true, ['claude-haiku-4-5', 'claude-sonnet-5']]);
    net.restore();

    net = models({ 'claude-sonnet-5': whole });
    await extractRecipeWithAi({ kind: 'image', base64: 'aGVsbG8=', mediaType: 'image/png' }, [key]);
    equal('a photo is read by the large model only', net.asked, ['claude-sonnet-5']);
    net.restore();
}
