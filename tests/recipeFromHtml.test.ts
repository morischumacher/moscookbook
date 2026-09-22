/** recipeFromHtml (link import) */
import { describeJsonLd, extractRecipeFromHtml } from '../src/lib/recipeFromHtml';
import { isSafePublicUrl } from '../src/lib/privateAddress';
import { suite, check } from './harness';

export default function run() {

    // Shape 1: plain Recipe node, HowToStep array, ImageObject
    const blogHtml = `<!doctype html><html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Recipe",
     "name":"Sp&auml;tzle mit K&auml;se",
     "description":"<p>Cremig und schnell.</p>",
     "image":{"@type":"ImageObject","url":"https://example.com/img.jpg"},
     "recipeCategory":"Hauptgericht","recipeCuisine":"Deutsch",
     "recipeIngredient":["400 g Sp&auml;tzle","200 g Bergk&auml;se","2 Zwiebeln","Salz"],
     "recipeInstructions":[
       {"@type":"HowToStep","text":"Zwiebeln anbraten."},
       {"@type":"HowToStep","text":"Sp&auml;tzle kochen."},
       {"@type":"HowToStep","text":"Schichten und servieren."}]}
    </script></head><body></body></html>`;

    const blog = extractRecipeFromHtml(blogHtml, 'https://example.com/r');
    suite('JSON-LD, HowToStep array');
    check('title decoded', blog.title === 'Spätzle mit Käse', blog.title);
    check('description stripped of tags', blog.description === 'Cremig und schnell.', blog.description);
    check('image from ImageObject', blog.imageUrl === 'https://example.com/img.jpg', blog.imageUrl);
    check('category', blog.category === 'Hauptgericht', blog.category);
    check('cuisine', blog.nationality === 'Deutsch', blog.nationality);
    check('4 ingredients', blog.ingredients.length === 4, blog.ingredients);
    check('ingredient parsed', blog.ingredients[0].amount === '400 g' && blog.ingredients[0].item === 'Spätzle', blog.ingredients[0]);
    check('salt without amount', blog.ingredients[3].amount === '' && blog.ingredients[3].item === 'Salz', blog.ingredients[3]);
    check('3 numbered steps', (blog.instructions.match(/^\d+\./gm) || []).length === 3, blog.instructions);
    check('sourceUrl kept', blog.sourceUrl === 'https://example.com/r');

    // Shape 2: @graph wrapper, type array, string instructions, image array
    const graphHtml = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
     {"@type":"WebSite","name":"Foodblog"},
     {"@type":["Recipe","Article"],
      "name":"Banana Bread",
      "image":["https://example.com/a.jpg","https://example.com/b.jpg"],
      "recipeIngredient":["3 ripe bananas","2 cups flour","1 tsp baking soda"],
      "recipeInstructions":"Preheat oven to 175C.\\nMash bananas.\\nBake 50 minutes."}]}
    </script></head><body></body></html>`;

    const graph = extractRecipeFromHtml(graphHtml);
    suite('@graph wrapper, type array, string instructions');
    check('found in @graph', graph.title === 'Banana Bread', graph.title);
    check('first image of array', graph.imageUrl === 'https://example.com/a.jpg', graph.imageUrl);
    check('3 ingredients', graph.ingredients.length === 3, graph.ingredients);
    check('cups parsed', graph.ingredients[1].amount === '2 cups', graph.ingredients[1]);
    check('string split into steps', (graph.instructions.match(/^\d+\./gm) || []).length === 3, graph.instructions);

    // Servings and times from schema.org fields
    const timedHtml = `<html><head><script type="application/ld+json">
    {"@type":"Recipe","name":"Gulasch","recipeYield":"4 Portionen",
     "prepTime":"PT20M","cookTime":"PT1H30M","totalTime":"PT1H50M",
     "recipeIngredient":["1 kg Rindfleisch"],"recipeInstructions":"Schmoren."}
    </script></head></html>`;
    const timed = extractRecipeFromHtml(timedHtml);
    suite('servings and times');
    check('servings from recipeYield', timed.servings === 4, timed.servings);
    check('prep time', timed.prepMinutes === 20, timed.prepMinutes);
    check('cook time preferred over total', timed.cookMinutes === 90, timed.cookMinutes);

    const totalOnlyHtml = `<html><head><script type="application/ld+json">
    {"@type":"Recipe","name":"Suppe","totalTime":"PT45M","recipeIngredient":["1 l Brühe"]}
    </script></head></html>`;
    const totalOnly = extractRecipeFromHtml(totalOnlyHtml);
    check('falls back to totalTime', totalOnly.cookMinutes === 45, totalOnly.cookMinutes);
    check('missing servings stay null', totalOnly.servings === null, totalOnly.servings);

    // Shape 3: HowToSection with nested itemListElement
    const sectionHtml = `<html><head><script type="application/ld+json">
    {"@type":"Recipe","name":"Lasagne","recipeIngredient":["500 g Hackfleisch"],
     "recipeInstructions":[{"@type":"HowToSection","name":"Sauce",
       "itemListElement":[{"@type":"HowToStep","text":"Hack anbraten."},{"@type":"HowToStep","text":"Tomaten zugeben."}]}]}
    </script></head></html>`;
    const section = extractRecipeFromHtml(sectionHtml);
    suite('HowToSection nesting');
    check('title', section.title === 'Lasagne', section.title);
    check('nested steps flattened', (section.instructions.match(/^\d+\./gm) || []).length === 2, section.instructions);

    // Shape 4: no JSON-LD -> og fallback
    const ogHtml = `<html><head><title>Omelett &ndash; Blog</title>
    <meta property="og:title" content="Omelett">
    <meta property="og:description" content="Schnell gemacht">
    <meta property="og:image" content="https://example.com/o.jpg"></head></html>`;
    const og = extractRecipeFromHtml(ogHtml);
    suite('no JSON-LD, og fallback');
    check('og title', og.title === 'Omelett', og.title);
    check('og description', og.description === 'Schnell gemacht', og.description);
    check('og image', og.imageUrl === 'https://example.com/o.jpg', og.imageUrl);
    check('no ingredients invented', og.ingredients.length === 0);

    // Malformed JSON must not throw
    suite('robustness');
    check('broken json ignored', extractRecipeFromHtml('<script type="application/ld+json">{oops</script>').title === '');
    check('empty html', extractRecipeFromHtml('').title === '');
    const multi = extractRecipeFromHtml(`<script type="application/ld+json">{"@type":"Organization"}</script>` + blogHtml);
    check('skips non-recipe block', multi.title === 'Spätzle mit Käse', multi.title);

    /* ------------------------------------------------ what the page claims */

    /*
     * `describeJsonLd` exists because a diagnostic printed a green "has
     * JSON-LD: yes" one line above "ingredients: 0", and read together those
     * two lines accuse the parser of being broken. On the page in question
     * both were true: Squarespace ships JSON-LD describing a blog post, with
     * no Recipe in it anywhere. The parser had nothing to find.
     *
     * So the question worth answering is not whether there is JSON-LD but
     * whether there is a recipe in it, because the two cases call for
     * completely different work.
     */
    suite('describeJsonLd');

    const blogOnly = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"The Perfect Fried Chicken Sandwich","author":{"@type":"Person","name":"Joshua Weissman"},"image":{"@type":"ImageObject","url":"https://example.com/a.jpg"}}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Joshua Weissman"}</script>
</head><body><p>Rezepttext</p></body></html>`;

    const blogReport = describeJsonLd(blogOnly);
    check('counts both blocks', blogReport.blocks === 2, blogReport.blocks);
    check('both parsed', blogReport.parsed === 2, blogReport.parsed);
    check('no recipe is reported as no recipe', !blogReport.hasRecipe, blogReport);
    check('and it names what is there instead', blogReport.types.includes('BlogPosting'), blogReport.types);
    check('nested types are found too', blogReport.types.includes('Person'), blogReport.types);

    // The rules agree with the report: nothing to extract.
    const nothing = extractRecipeFromHtml(blogOnly, 'https://example.com/r');
    check('and the rules indeed find no ingredients', nothing.ingredients.length === 0, nothing.ingredients);

    const withRecipe = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Linsensuppe","recipeIngredient":["250 g Linsen"],"recipeInstructions":"Kochen."}]}</script></head><body></body></html>`;

    const found = describeJsonLd(withRecipe);
    check('a recipe behind @graph is found', found.hasRecipe, found);
    check('and its type is listed', found.types.includes('Recipe'), found.types);

    const broken = `<html><head><script type="application/ld+json">{ this is not json </script></head><body></body></html>`;
    const brokenReport = describeJsonLd(broken);
    check('a block that will not parse is still counted', brokenReport.blocks === 1, brokenReport);
    check('but not counted as parsed', brokenReport.parsed === 0, brokenReport);
    check('and it is not a recipe', !brokenReport.hasRecipe, brokenReport);

    const bare = describeJsonLd('<html><body><p>nichts</p></body></html>');
    check('a page with no JSON-LD reports none', bare.blocks === 0 && !bare.hasRecipe, bare);

    // The module-level regex carries the `g` flag and is shared between
    // `describeJsonLd` and the extractor. `matchAll` does not move its
    // `lastIndex`, but a second call proving it is cheaper than trusting that.
    const twice = describeJsonLd(blogOnly);
    check('the shared pattern is not stateful', twice.blocks === 2 && twice.parsed === 2, twice);

    suite('isSafePublicUrl');
    for (const bad of ['http://localhost:3000/x','http://127.0.0.1/x','http://10.0.0.5/x','http://192.168.1.1/x','http://172.16.0.1/x','http://169.254.169.254/latest/meta-data','file:///etc/passwd','not a url','http://[::1]/x']) {
        check(`blocks ${bad}`, !isSafePublicUrl(bad));
    }
    for (const good of ['https://www.chefkoch.de/rezepte/123','http://example.com/r','https://8.8.8.8/r']) {
        check(`allows ${good}`, isSafePublicUrl(good));
    }


}
