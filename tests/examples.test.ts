/** The example entry and collection — which are also the editor's test */
import { suite, check, equal } from './harness';
import { exampleCollection, examplePost, EXAMPLE_POST_SLUG } from '../src/lib/examples';
import { postInputSchema } from '../src/lib/postSchema';
import { collectionInputSchema } from '../src/lib/collectionSchema';

const recipes = [
    { id: 1, title: 'Käsespätzle', slug: 'kaesespaetzle', image: 'https://store.public.blob.vercel-storage.com/a.jpg' },
    { id: 2, title: 'Green Curry', slug: 'green-curry', image: 'https://store.public.blob.vercel-storage.com/b.jpg' },
    { id: 3, title: 'Zwetschgenkuchen', slug: 'zwetschgenkuchen', image: null },
];

/**
 * An example exists to show everything the editor can do. If one of these
 * fails, the example has stopped showing something — or the editor has
 * stopped being able to do it.
 */
const FEATURES: Array<[string, RegExp]> = [
    ['a heading', /^## /m],
    ['bold', /\*\*[^*]+\*\*/],
    ['italic', /(^|[^*])\*[^*\n]+\*(?!\*)/],
    ['a list', /^- /m],
    ['a link', /\]\((https?:\/\/|\/)/],
    ['a picture in the text, with a caption', /!\[[^\]]*\]\(https:\/\/[^ )]+ "[^"]+"\)/],
];

export default function examplesTests() {
    for (const locale of ['de', 'en'] as const) {
        suite(`examples (${locale}): the entry uses every feature`);

        const collection = exampleCollection(locale, recipes);
        const post = examplePost(locale, recipes, { id: 9, slug: collection.slug, title: collection.title });

        for (const [what, pattern] of FEATURES) {
            check(`the entry has ${what}`, pattern.test(post.body), post.body);
        }
        check('the entry has a quote', /^> /m.test(post.body));
        check('and a numbered list, numbered', /^1\. .*\n2\. /m.test(post.body));
        equal('it is about several recipes', post.recipeIds, [1, 2, 3]);
        equal('and the collection', post.collectionIds, [9]);
        check('it has a cover picture', Boolean(post.imageUrl));
        check('it links to the collection', post.body.includes(`/collections/${collection.slug}`));
        equal('under its own address', post.slug, EXAMPLE_POST_SLUG[locale]);

        const asInput = postInputSchema.safeParse({ ...post, published: false });
        check('the editor would accept it as written', asInput.success, asInput.success ? '' : asInput.error.issues);

        suite(`examples (${locale}): the collection uses every feature`);
        for (const [what, pattern] of FEATURES) {
            check(`the description has ${what}`, pattern.test(collection.description), collection.description);
        }
        check('it has a cover picture', Boolean(collection.imageUrl));
        equal('it holds the recipes, in order', collection.recipeIds, [1, 2, 3]);

        const collectionInput = collectionInputSchema.safeParse(collection);
        check(
            'the form would accept it as written',
            collectionInput.success,
            collectionInput.success ? '' : collectionInput.error.issues
        );
    }

    suite('examples: with no recipes yet');
    const bare = examplePost('de', [], null);
    check('an entry is still made', bare.body.length > 100);
    check('with no broken pictures in it', !/!\[/.test(bare.body));
}
