/** recipeSchema + ingredient helpers */
import { recipeInputSchema, formatZodError } from '../src/lib/recipeSchema';
import { slugify } from '../src/lib/recipe';
import { suite, check } from './harness';

export default function run() {

    suite('slugify');
    check('umlauts', slugify("Käsespätzle mit Röstzwiebeln") === 'kaesespaetzle-mit-roestzwiebeln', slugify("Käsespätzle mit Röstzwiebeln"));
    check('sharp s', slugify('Weiße Soße') === 'weisse-sosse', slugify('Weiße Soße'));
    check('trims dashes', slugify('  --Hello World!!  ') === 'hello-world', slugify('  --Hello World!!  '));
    check('accents', slugify('Crème Brûlée') === 'creme-brulee', slugify('Crème Brûlée'));

    suite('recipeInputSchema');
    const base = { title: 'Test', slug: 'Test Rezept', instructions: 'Kochen.' };

    const a = recipeInputSchema.safeParse(base);
    check('minimal payload valid', a.success, a.success ? '' : formatZodError(a.error));
    check('slug normalised', a.success && a.data.slug === 'test-rezept', a.success && a.data.slug);
    check('imageUrl stays undefined when omitted', a.success && a.data.imageUrl === undefined);
    check('defaults applied', a.success && a.data.description === '' && Array.isArray(a.data.ingredients));

    const b = recipeInputSchema.safeParse({ ...base, imageUrl: '' });
    check('empty imageUrl allowed (clears image)', b.success && b.data.imageUrl === '');

    const c = recipeInputSchema.safeParse({ ...base, imageUrl: 'https://x.public.blob.vercel-storage.com/a.jpg' });
    check('https imageUrl allowed', c.success && c.data.imageUrl?.startsWith('https://'));

    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'not-a-url', 'ftp://x/a.jpg']) {
        const d = recipeInputSchema.safeParse({ ...base, imageUrl: bad });
        check(`rejects imageUrl ${bad}`, !d.success);
    }
    const okHttp = recipeInputSchema.safeParse({ ...base, imageUrl: 'http://example.com/a.jpg' });
    check('http imageUrl allowed', okHttp.success);

    const e = recipeInputSchema.safeParse({ ...base, title: '' });
    check('empty title rejected', !e.success);

    const f = recipeInputSchema.safeParse({ ...base, slug: '!!!' });
    check('slug that normalises to empty rejected', !f.success);

    const g = recipeInputSchema.safeParse({ ...base, ingredients: [{ amount: '200g', item: 'Mehl' }, { item: 'Ei' }] });
    check('ingredients parsed with default amount', g.success && g.data.ingredients[1].amount === '', g.success ? g.data.ingredients : formatZodError(g.error));

    const h = recipeInputSchema.safeParse({ ...base, instructions: '' });
    check('empty instructions rejected', !h.success);
    check('error message readable', !h.success && formatZodError(h.error).includes('Instructions'), !h.success && formatZodError(h.error));

    const i = recipeInputSchema.safeParse({ ...base, title: 'x'.repeat(500) });
    check('overlong title rejected', !i.success);


}
