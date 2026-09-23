/** The recipe page's picture stays the width of the reading column on a laptop */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suite, check } from './harness';

export default function recipeLayoutTests() {
    suite('recipe page: the picture');
    const article = readFileSync(join(__dirname, '..', 'src', 'components', 'recipe', 'RecipeArticle.tsx'), 'utf8');
    // Lost once already: without it the photograph spans the whole screen
    // and is taller than a laptop's window.
    check('the gallery opens the page as the hero', /<Gallery\s[^>]*variant="hero"/.test(article), 'RecipeArticle must pass variant="hero"');
}
