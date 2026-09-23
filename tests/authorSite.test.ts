/** "Recipe on pattyplates.com (link in bio)": found on the author's site, without a model */
import { suite, equal, check } from './harness';
import { stubFetch } from './stubFetch';
import { dishName, handleFromUrl, pickResult, resultsFromSearchHtml, resultsFromWpJson, searchUrls, sitesInText, type AccountSiteStore } from '../src/lib/authorSite';
import { processCapture } from '../src/lib/captureProcess';
import { classifyCapture } from '../src/lib/capture';
import type { AiCapability } from '../src/lib/aiImport';

const CAPTION = 'Corn Kakiage Comment “corn” to get the recipe in your DM’s or go to pattyplates.com (link in bio) #corn #crispy #summerrecipe';

const embed = (author: string, caption: string) =>
    `<html><body><div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/${author}/">${author}</a><br />${caption}<div class="CaptionComments"></div></div></body></html>`;

const RECIPE_PAGE = `<!DOCTYPE html><html><head><title>Corn Kakiage | Patty Plates</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Corn Kakiage","recipeIngredient":["2 ears corn","60 g flour","60 ml ice water","oil for frying"],"recipeInstructions":[{"@type":"HowToStep","text":"Cut the corn off the cob and mix with flour and ice water."},{"@type":"HowToStep","text":"Fry spoonfuls in hot oil until crisp, 3 minutes."}]}</script>
</head><body><h1>Corn Kakiage</h1></body></html>`;

const WP_SEARCH = 'https://pattyplates.com/wp-json/wp/v2/posts?search=Corn%20Kakiage&per_page=5&_fields=link,title';

function memoryAccounts(): AccountSiteStore & { rows: Map<string, string> } {
    const rows = new Map<string, string>();
    return {
        rows,
        get: async (platform, handle) => rows.get(`${platform}/${handle}`) ?? null,
        remember: async (platform, handle, host) => void rows.set(`${platform}/${handle}`, host),
    };
}

// A model that is switched on but unreachable: asking it would show as a failed read.
const AI_ON: AiCapability = { mode: 'always', keys: [{ provider: 'anthropic', apiKey: 'sk-ant-TEST', model: null }] };

export default async function authorSiteTests() {
    suite('author site: reading the caption');
    equal('the site a caption names', sitesInText(CAPTION), ['pattyplates.com']);
    equal('not Instagram, link services or shops', sitesInText('Link in bio → linktr.ee/x, instagram.com/y, amzn.to/z, meinblog.de'), ['meinblog.de']);
    equal('not an e-mail address', sitesInText('Fragen an hallo@kochblog.de'), []);
    equal('the dish, without the call to action', dishName(CAPTION), 'Corn Kakiage');
    equal('emoji and hashtags gone', dishName('🔥 Spicy Vodka Pasta 🔥 #pasta'), 'Spicy Vodka Pasta');
    equal('nothing left, no dish', dishName('Comment PASTA for the recipe'), '');
    equal('a TikTok handle', handleFromUrl('https://www.tiktok.com/@pattyplates/video/123'), 'pattyplates');

    suite('author site: choosing the result');
    equal('the site search first', searchUrls('pattyplates.com', 'Corn Kakiage')[0], WP_SEARCH);
    const fromJson = resultsFromWpJson(JSON.stringify([{ link: 'https://pattyplates.com/corn-kakiage/', title: { rendered: 'Corn Kakiage &#8211; crispy' } }]));
    equal('the matching post', pickResult(fromJson, 'Corn Kakiage'), 'https://pattyplates.com/corn-kakiage/');
    equal('a different dish is not it', pickResult([{ url: 'https://pattyplates.com/miso-soup/', title: 'Miso Soup' }], 'Corn Kakiage'), null);
    const fromHtml = resultsFromSearchHtml('<a href="/tag/corn/">corn</a><a href="https://pattyplates.com/corn-kakiage/">Corn Kakiage</a><a href="https://other.com/corn-kakiage/">x</a>', 'pattyplates.com');
    equal('from a search page: only posts of that site', fromHtml.map((result) => result.url), ['https://pattyplates.com/corn-kakiage/']);

    suite('author site: the whole import');
    const accounts = memoryAccounts();
    let restore = stubFetch({
        'https://www.instagram.com/p/DAbc123xyz/embed/captioned/': { html: embed('pattyplates', CAPTION) },
        [WP_SEARCH]: { html: JSON.stringify([{ link: 'https://pattyplates.com/corn-kakiage/', title: { rendered: 'Corn Kakiage' } }]), contentType: 'application/json' },
        'https://pattyplates.com/corn-kakiage/': { html: RECIPE_PAGE },
    });
    const found = await processCapture(classifyCapture({ url: 'https://www.instagram.com/p/DAbc123xyz/' })!, AI_ON, { accounts });
    restore();
    equal('the recipe from the site', found.draft?.title, 'Corn Kakiage');
    equal('complete', found.status, 'ready');
    equal('read by the rules, no model', found.readBy, 'rules');
    equal('filed under the post that was shared', found.draft?.sourceUrl, 'https://www.instagram.com/p/DAbc123xyz/');
    equal('the account’s site is remembered', accounts.rows.get('instagram/pattyplates'), 'pattyplates.com');

    // The next post only says "link in bio": the remembered site is searched.
    const next = 'Corn Kakiage 🌽 recipe link in bio!';
    restore = stubFetch({
        'https://www.instagram.com/p/DAbc123xyz/embed/captioned/': { html: embed('pattyplates', next) },
        [WP_SEARCH]: { html: JSON.stringify([{ link: 'https://pattyplates.com/corn-kakiage/', title: { rendered: 'Corn Kakiage' } }]), contentType: 'application/json' },
        'https://pattyplates.com/corn-kakiage/': { html: RECIPE_PAGE },
    });
    const again = await processCapture(classifyCapture({ url: 'https://www.instagram.com/p/DAbc123xyz/' })!, AI_ON, { accounts });
    restore();
    equal('found through the remembered site', again.status, 'ready');

    suite('author site: a post without a recipe costs nothing');
    restore = stubFetch({
        'https://www.instagram.com/p/DAbc123xyz/embed/captioned/': { html: embed('someone', 'Crispy Tofu Bowl — comment BOWL and I’ll DM you the recipe. Crunchy tofu, sticky sauce, rice and pickled veg: the weeknight bowl you will make on repeat all summer long.') },
    });
    const promo = await processCapture(classifyCapture({ url: 'https://www.instagram.com/p/DAbc123xyz/' })!, AI_ON, { accounts: memoryAccounts() });
    const forced = await processCapture(classifyCapture({ url: 'https://www.instagram.com/p/DAbc123xyz/' })!, AI_ON, { accounts: memoryAccounts(), force: true });
    restore();
    equal('the model is not asked', promo.readBy, 'rules');
    check('and the inbox says where the recipe is', (promo.error ?? '').includes('recipeByDm'), promo.error);
    check('unless somebody presses the button', forced.readBy !== 'rules', forced.readBy);
}
