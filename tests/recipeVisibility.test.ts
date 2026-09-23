/** "Only me": every place that shows recipes to others leaves them out */
import { readFileSync } from 'node:fs';
import { suite, check, equal } from './harness';
import { maysee, visibleTo } from '../src/lib/recipeVisibility';
import { buildArchive, parseArchive, type ExportableRecipe } from '../src/lib/archive';
import { recipeColumns } from '../src/lib/recipeRepo';

const source = (path: string) => readFileSync(path, 'utf8');

export default function recipeVisibilityTests() {
    suite('only me: who sees it');
    equal('an admin sees everything', visibleTo({ admin: true }), {});
    equal('a member does not see the admins\' own', visibleTo({ admin: false }), { onlyMe: false });
    equal('nor does a visitor', visibleTo(null), { onlyMe: false });
    check('the page: hidden from a member', !maysee({ onlyMe: true }, { admin: false }));
    check('shown to an admin', maysee({ onlyMe: true }, { admin: true }));

    suite('only me: every place filters it');
    const musts: [string, string, RegExp][] = [
        ['the front page list', 'src/app/[locale]/page.tsx', /isDraft: false, \.\.\.visibleTo\(user\)/],
        ['its search', 'src/app/[locale]/page.tsx', /"onlyMe" = false OR \$\{admin\}/],
        ['the recipe page', 'src/app/[locale]/recipe/[slug]/page.tsx', /!maysee\(recipe, user\)\) notFound\(\)/],
        ['a share link', 'src/app/[locale]/r/[token]/page.tsx', /onlyMe: false/],
        ['a collection', 'src/lib/collectionQuery.ts', /isDraft: false, onlyMe: false/],
        ['the collections page', 'src/app/[locale]/collections/page.tsx', /onlyMe: false/],
        ['a post', 'src/components/post/PostArticle.tsx', /where: \{ recipe: \{ onlyMe: false \} \}/],
        ['a menu\'s links', 'src/lib/menuQuery.ts', /!item\.recipe\.onlyMe/],
        ['the shopping list', 'src/lib/shoppingDb.ts', /visibleTo\(viewer\)/],
        ['favourites', 'src/app/api/favorites/route.ts', /visibleTo\(user\)/],
        ['recipes like this one', 'src/lib/similarRecipes.ts', /"onlyMe" = false/],
        ['the filter chips', 'src/lib/collectionFacets.ts', /"onlyMe" = false/],
        ['no link can be made', 'src/app/api/recipes/[id]/share/route.ts', /if \(recipe\.onlyMe\)/],
        ['it cannot be made public', 'src/app/api/recipes/[id]/visibility/route.ts', /isDraft: false, onlyMe: false/],
        ['no post can link it', 'src/lib/postLinks.ts', /recipe\.onlyMe/],
    ];
    for (const [what, path, pattern] of musts) check(what, pattern.test(source(path)), `${path} — ${pattern}`);

    suite('only me: turning it on');
    const columns = recipeColumns({
        title: 'A', slug: 'a', description: null, category: null, nationality: null, instructions: '1.',
        servings: null, prepMinutes: null, cookMinutes: null, ingredients: [], onlyMe: true,
    }) as Record<string, unknown>;
    check('takes it off the web and withdraws its link', columns.isPublic === false && columns.shareToken === null, columns);

    suite('only me: through a backup');
    const row = {
        title: 'Geheim', slug: 'geheim', description: null, instructions: '1.', category: null, nationality: null,
        servings: null, prepMinutes: null, cookMinutes: null, views: 0, isPublic: false, isDraft: false, onlyMe: true,
        createdAt: new Date('2026-09-01T00:00:00Z'), images: [], tags: [], categories: [], cuisines: [], spiciness: 0,
        ingredients: [], language: null, translations: [],
    } as ExportableRecipe;
    const back = parseArchive(JSON.parse(JSON.stringify(buildArchive([row], new Date()))));
    equal('comes back only the admins\'', back.archive?.recipes[0].onlyMe, true);
}
