/** collectionSchema — the address a collection lives at */
import { suite, equal, check } from './harness';
import { collectionInputSchema, collectionSlug } from '../src/lib/collectionSchema';

export default function collectionSchemaTests() {
    suite('collectionSchema address');

    const parse = (slug: unknown) => collectionInputSchema.safeParse({ title: 'My favorites', slug });

    const empty = parse('');
    equal('an empty field means "let the app choose"', empty.success && empty.data.slug, null);

    const missing = parse(undefined);
    equal('no field at all means the same', missing.success && missing.data.slug, null);

    const typed = parse('  My Favorites ');
    equal('a typed address is made into a proper one', typed.success && typed.data.slug, 'my-favorites');

    check('an address of nothing but punctuation is refused', !parse('!!!').success);

    equal('a derived address follows the name', collectionSlug('My favorites'), 'my-favorites');
}
