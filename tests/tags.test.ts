/** Tags, and the two diet tags suggested from the ingredients */
import { suite, equal } from './harness';
import { dietFrom, normaliseTags } from '../src/lib/tags';
import { buildRecipeJsonLd } from '../src/lib/recipeJsonLd';

export default function tagsTests() {
    suite('tags: as they are kept');
    equal('trimmed, lower case, once', normaliseTags(['Grillen ', 'grillen', '  Sommer']), ['grillen', 'sommer']);
    equal('the diet tags in either language', normaliseTags(['Vegetarisch', 'vegan']), ['vegetarian', 'vegan']);

    suite('tags: what the ingredients allow');
    equal('meat rules both out', dietFrom(['Rinderhack', 'Zwiebeln']), []);
    equal('fish too', dietFrom(['Lachsfilet', 'Dill']), []);
    equal('cheese is vegetarian', dietFrom(['Spätzle', 'Bergkäse']), ['vegetarian']);
    equal('eggs as well', dietFrom(['Mehl', 'Eier']), ['vegetarian']);
    equal('plants alone are vegan', dietFrom(['Linsen', 'Karotten', 'Olivenöl']), ['vegetarian', 'vegan']);
    equal('oat milk is not milk', dietFrom(['Haferflocken', 'Hafermilch']), ['vegetarian', 'vegan']);
    equal('nothing listed, nothing offered', dietFrom([]), []);

    suite('tags: for search engines');
    const data = buildRecipeJsonLd({
        title: 'Linsen-Dal', description: null, instructions: '1. Kochen.', category: null, nationality: null,
        servings: 2, prepMinutes: null, cookMinutes: null, createdAt: new Date(), images: [], ingredients: [], rating: { count: 0, sum: 0 },
        tags: ['vegan', 'vegetarian', 'winter'], url: 'https://example.com/dal',
    });
    equal('keywords', data.keywords, 'winter');
    equal('and the diet', data.suitableForDiet, ['https://schema.org/VeganDiet', 'https://schema.org/VegetarianDiet']);
}
