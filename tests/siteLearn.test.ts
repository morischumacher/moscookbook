/** siteLearn — proposing a site profile, and refusing to believe it */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check, equal } from './harness';
import { learnSiteProfile, profileFrom, verifyProfile, blockListing } from '../src/lib/siteLearn';
import { applyProfile, type SiteProfile } from '../src/lib/siteProfile';
import type { AiExtractionResult, AiKey } from '../src/lib/aiImport';

/**
 * The verification step is the only thing standing between a model's guess and
 * a stored instruction that will be followed on every future import from that
 * site, without anyone looking. So the checks below are weighted towards the
 * profiles that must be *rejected* — a profile that finds nothing is harmless
 * and self-correcting, while a profile that finds the wrong thing is a wrong
 * recipe on every import from then on.
 */
export default async function siteLearnTests() {
    const key: AiKey = { provider: 'anthropic', apiKey: 'test', model: null };

    const page = `<html><head>
<meta property="og:title" content="Fried Chicken Sandwich — Joshua Weissman">
<meta property="og:image" content="https://example.com/c.jpg">
</head><body>
<h1>Fried Chicken Sandwich</h1>
<h2>Ingredients</h2>
<ul><li>4 chicken thighs</li><li>2 cups buttermilk</li><li>1 tbsp kosher salt</li><li>2 cups all purpose flour</li></ul>
<h2>Method</h2>
<p>Brine the chicken thighs in the buttermilk overnight in the fridge.</p>
<p>Dredge each thigh through the seasoned flour until completely coated.</p>
<p>Fry in neutral oil at 175 degrees until deeply golden and cooked through.</p>
<h2>You might also like</h2>
<ul><li>Spicy garlic noodles</li><li>Miso glazed aubergine</li></ul>
</body></html>`;

    const extracted: AiExtractionResult = {
        title: 'Fried Chicken Sandwich',
        description: '',
        ingredients: [
            { amount: '4', item: 'chicken thighs' },
            { amount: '2 cups', item: 'buttermilk' },
            { amount: '1 tbsp', item: 'kosher salt' },
            { amount: '2 cups', item: 'all purpose flour' },
        ],
        instructions:
            'Brine the chicken thighs in the buttermilk overnight in the fridge.\n\n' +
            'Dredge each thigh through the seasoned flour until completely coated.\n\n' +
            'Fry in neutral oil at 175 degrees until deeply golden and cooked through.',
        category: '',
        nationality: '',
        servings: null,
        prepMinutes: null,
        cookMinutes: null,
    };

    const right: SiteProfile = {
        title: { kind: 'meta', property: 'og:title' },
        image: { kind: 'meta', property: 'og:image' },
        ingredients: { kind: 'listAfterHeading', heading: 'Ingredients' },
        method: { kind: 'textAfterHeading', heading: 'Method' },
    };

    /* ------------------------------------------------ reading the model's answer */

    suite('siteLearn: what the model said');

    const plain = profileFrom(JSON.stringify(right));
    check('a clean answer parses', plain?.ingredients?.kind === 'listAfterHeading', plain);

    const fenced = profileFrom('```json\n' + JSON.stringify(right) + '\n```');
    check('a fenced answer parses', fenced?.method?.kind === 'textAfterHeading', fenced);

    const chatty = profileFrom(`Sure! Here is the mapping:\n${JSON.stringify(right)}\nHope that helps.`);
    check('an answer wrapped in prose parses', chatty?.ingredients !== undefined, chatty);

    equal('nonsense gives nothing', profileFrom('I could not tell.'), null);
    equal('an empty object gives nothing', profileFrom('{}'), null);

    /*
     * Field by field rather than all or nothing. A model that names three good
     * strategies and invents a fourth has still learned three quarters of the
     * site, and throwing it all away means paying for the call again.
     */
    const partly = profileFrom(
        JSON.stringify({
            ingredients: right.ingredients,
            method: right.method,
            title: { kind: 'evaluate', code: 'fetch("http://x")' },
        })
    );
    check('an invented strategy is dropped', partly?.title === undefined, partly);
    check('and the good ones are kept', partly?.ingredients !== undefined && partly?.method !== undefined, partly);

    // A null field is how the prompt says "I do not know", not an error.
    const nulls = profileFrom(JSON.stringify({ ...right, image: null }));
    check('a null field is simply absent', nulls?.image === undefined && nulls?.title !== undefined, nulls);

    /* -------------------------------------------------------- the page as shown */

    suite('siteLearn: the page the model is shown');

    const listing = blockListing(page);
    check('headings are labelled by rank', listing.includes('H2   Ingredients'), listing.slice(0, 400));
    check('list items are labelled', listing.includes('ITEM 2 cups buttermilk'), listing.slice(0, 600));
    check('blocks are numbered so a heading can be pointed at', /^\s*0 H1/m.test(listing), listing.slice(0, 200));

    /* --------------------------------------------------------- the verification */

    suite('siteLearn: verifying a profile against the page it came from');

    const good = verifyProfile(applyProfile(page, right), extracted);
    check('a correct profile is accepted', good.ok, good);
    check('and reports how much it matched', good.ingredientsFound === 1, good);

    /*
     * The one that matters. This profile contains everything the model found
     * — so every overlap test passes perfectly — and also two recipe names
     * that are not ingredients. A draft made from it scores as `good`, reads
     * as a real recipe, and is wrong. Only the ceiling catches it.
     */
    const greedy = verifyProfile(
        applyProfile(page, { ...right, ingredients: { kind: 'selector', selector: 'li', take: 'each' } }),
        { ...extracted, ingredients: extracted.ingredients.slice(0, 2) }
    );
    check('a profile that sweeps up too much is rejected', !greedy.ok, greedy);
    check('and says why', (greedy.reason ?? '').includes('ingredient lines'), greedy.reason);

    // Pointed at the wrong heading entirely.
    const wrongList = verifyProfile(
        applyProfile(page, { ...right, ingredients: { kind: 'listAfterHeading', heading: 'You might also like' } }),
        extracted
    );
    check('a profile reading the wrong list is rejected', !wrongList.ok, wrongList);
    check('because almost nothing matched', wrongList.ingredientsFound < 0.7, wrongList);

    // A heading that is not on the page at all.
    const absent = verifyProfile(
        applyProfile(page, { ...right, ingredients: { kind: 'listAfterHeading', heading: 'Zutaten' } }),
        extracted
    );
    check('a profile naming a heading that is not there is rejected', !absent.ok, absent);
    check('and names the field', (absent.reason ?? '').includes('ingredients'), absent.reason);


    // Right ingredients, method pointed somewhere else.
    const wrongMethod = verifyProfile(
        applyProfile(page, { ...right, method: { kind: 'textAfterHeading', heading: 'You might also like' } }),
        extracted
    );
    check('a profile with the wrong method is rejected', !wrongMethod.ok, wrongMethod);

    /*
     * Nothing to check against is not a pass. A model that returned an empty
     * recipe cannot confirm anything, and a profile verified against nothing
     * would be stored on no evidence at all.
     */
    const nothingToCheck = verifyProfile(applyProfile(page, right), {
        ...extracted,
        ingredients: [],
        instructions: '',
    });
    check('an empty model answer cannot verify anything', !nothingToCheck.ok, nothingToCheck);

    /*
     * These two pin the *reason*, not just the refusal.
     *
     * Both rules were, when first written, covered by accident: a missing
     * anchor produces no ingredients, which the overlap floor then catches
     * anyway, so deleting the rule changed nothing any test could see. A rule
     * nothing tests is a rule that will be removed by someone tidying up. The
     * sabotage run is what found this, not reading.
     */
    check(
        'a missing anchor is refused as a missing anchor',
        (absent.reason ?? '').includes('could not find'),
        absent.reason
    );
    check(
        'and an empty model answer as an empty model answer',
        (nothingToCheck.reason ?? '').includes('no recipe to check'),
        nothingToCheck.reason
    );

    /*
     * And the tolerance that has to exist: a model tidies as it reads. It
     * rewrites "2 c." as "2 cups", drops "for serving", merges a split line.
     * Demanding identity would reject every correct profile ever proposed.
     */
    const tidied = verifyProfile(applyProfile(page, right), {
        ...extracted,
        ingredients: [
            { amount: '4', item: 'chicken thighs, boneless' },
            { amount: '2 cups', item: 'buttermilk, cold' },
            { amount: '1 tbsp', item: 'kosher salt' },
        ],
    });
    check('a model that tidied its answer still verifies', tidied.ok, tidied);

    /* -------------------------------------------------------------- end to end */

    suite('siteLearn: the whole step');

    const answering = (reply: string) => async () => reply;

    const learned = await learnSiteProfile(page, extracted, key, answering(JSON.stringify(right)));
    check('a good proposal is learned', learned.profile !== null, learned.note);
    check('and says so', learned.note.includes('verified'), learned.note);

    const refused = await learnSiteProfile(
        page,
        extracted,
        key,
        answering(JSON.stringify({ ...right, ingredients: { kind: 'listAfterHeading', heading: 'You might also like' } }))
    );
    check('a bad proposal is not learned', refused.profile === null, refused);
    check('and the reason survives', refused.note.startsWith('rejected —'), refused.note);

    // A profile with a title and a picture but no food is not a profile.
    const foodless = await learnSiteProfile(
        page,
        extracted,
        key,
        answering(JSON.stringify({ title: right.title, image: right.image }))
    );
    check('a profile with no food is not learned', foodless.profile === null, foodless);
    check('and is refused before it is even run', foodless.verification === null, foodless);

    const mute = await learnSiteProfile(page, extracted, key, answering('no idea, sorry'));
    check('an unusable answer is not learned', mute.profile === null, mute);

    const broke = await learnSiteProfile(page, extracted, key, async () => {
        throw new Error('503 from the provider');
    });
    check('a provider failure is not learned', broke.profile === null, broke);
    check('and is reported rather than thrown', broke.note.includes('503'), broke.note);

    /*
     * But a miss on a *cosmetic* field is not a rejection. A page with no
     * `og:image` should not cost us a working mapping of its ingredients and
     * method — the picture strategy is simply not learned.
     */
    const noPicture = page.replace(/<meta property="og:image"[^>]*>/, '');
    const withoutImage = await learnSiteProfile(noPicture, extracted, key, answering(JSON.stringify(right)));
    check('a page with no image still yields a profile', withoutImage.profile !== null, withoutImage);
    check(
        'and the strategy that missed is not stored',
        withoutImage.profile?.image === undefined,
        withoutImage.profile
    );
    check(
        'while the ones that worked are',
        withoutImage.profile?.ingredients !== undefined && withoutImage.profile?.method !== undefined,
        withoutImage.profile
    );

    /*
     * Instagram, TikTok and everything else that renders itself in the browser.
     *
     * The page arrives as a shell: no headings, no list, no prose. The whole
     * recipe is in `og:title`, which is why `aiInput` feeds the meta tags to
     * the model and why those imports work at all.
     *
     * What must NOT happen is a profile being stored for such a site. There is
     * nothing to anchor to, so anything stored would be a mapping that finds
     * nothing — and every later import would follow it, find nothing, and only
     * recover after three failures. A site that cannot be learned has to be
     * refused rather than half-learned.
     */
    const RENDERED_IN_BROWSER = `<html><head>
<meta property="og:title" content="Ben Slater auf Instagram: «Perfect lasagne. 500 g Hackfleisch, 2 Dosen Tomaten, Béchamel. Schichten und 40 Minuten backen.»">
<meta property="og:image" content="https://instagram.example/p.jpg">
</head><body><div id="mount"></div><div class="x1n2onr6"></div></body></html>`;

    const platform = await learnSiteProfile(
        RENDERED_IN_BROWSER,
        extracted,
        key,
        answering(JSON.stringify(right))
    );
    check('a page rendered in the browser teaches nothing', platform.profile === null, platform);
    check(
        'and the reason is the page, not the model',
        platform.note.includes('structure') || platform.note.startsWith('rejected'),
        platform.note
    );

    // Even a model that confidently names meta tags for everything is refused,
    // because a title and a picture are not a recipe.
    const metaOnly = await learnSiteProfile(
        RENDERED_IN_BROWSER,
        extracted,
        key,
        answering(
            JSON.stringify({
                title: { kind: 'meta', property: 'og:title' },
                image: { kind: 'meta', property: 'og:image' },
            })
        )
    );
    check('meta tags alone are not a profile', metaOnly.profile === null, metaOnly);

    const shapeless = await learnSiteProfile('', extracted, key, answering(JSON.stringify(right)));
    check('a page with no structure is not asked about at all', shapeless.profile === null, shapeless);
}

function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? routeFiles(path) : name.endsWith('.ts') ? [path] : [];
    });
}

/**
 * The pipeline could read and learn site profiles for months and was never
 * given the store to do it with: no caller passed `profiles` or `learnWith`,
 * so nothing was ever learned and the inbox asked a model about the same
 * sites again and again. This keeps every caller wired.
 */
export function siteLearnWiringTests() {
    suite('site learning: every import is given the store');

    const callers = routeFiles('src/app/api').filter((path) =>
        readFileSync(path, 'utf8').includes('processCapture(')
    );

    check('there are routes that read pages', callers.length >= 3, callers);
    for (const path of callers) {
        check(`${path} passes siteLearning`, readFileSync(path, 'utf8').includes('...siteLearning('));
    }
}

