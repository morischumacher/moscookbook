/** Drafts — the state between the inbox and a recipe of this cookbook's own */
import { readFileSync } from 'node:fs';
import { suite, check } from './harness';
import { archiveSchema } from '../src/lib/archive';

/**
 * A draft is a *negative* feature: its whole content is the list of places it
 * must not appear. There is nothing to render and nothing to compute, so there
 * is nothing an ordinary unit test can hold on to — the behaviour lives in
 * where-clauses spread across a dozen files, and the failure mode is one of
 * them being forgotten.
 *
 * So these checks read the source. That is a blunt instrument and it is the
 * right one here: a query that loses its filter is a private recipe on the
 * public internet, and the alternative is a test suite that boots Postgres and
 * Next together to discover the same fact more slowly.
 *
 * Each check names the file, the reason, and what would happen without it.
 * When one fails, the message should be enough to decide whether the filter
 * was removed by mistake or the query moved somewhere else.
 */
function source(path: string): string {
    return readFileSync(path, 'utf8');
}

export default function draftsTests() {
    suite('drafts: the places a draft must not appear');

    const musts: Array<[string, string, RegExp]> = [
        [
            'the front page list filters drafts out',
            'src/app/[locale]/page.tsx',
            /const where: RecipeWhere = \{ isDraft: false \}/,
        ],
        [
            'and so does its search query, which bypasses that object',
            'src/app/[locale]/page.tsx',
            /WHERE "isDraft" = false/,
        ],
        [
            'and the last query before the tiles are drawn',
            'src/app/[locale]/page.tsx',
            /where: \{ id: \{ in: pageIds \}, isDraft: false \}/,
        ],
        [
            '"recipes like this one" does not suggest a draft',
            'src/lib/similarRecipes.ts',
            /AND r\."isDraft" = false/,
        ],
        [
            'the filter chips do not count what the list will not show',
            'src/lib/collectionFacets.ts',
            /count\(\{ where: \{ isDraft: false \} \}\)/,
        ],
        [
            'a collection does not carry a draft to its public share page',
            'src/lib/collectionQuery.ts',
            /where: \{ recipe: \{ isDraft: false \} \}/,
        ],
        [
            'a share link for a draft finds nothing',
            'src/app/[locale]/r/[token]/page.tsx',
            /shareToken: token, isDraft: false/,
        ],
        [
            'the sitemap does not offer one to a search engine',
            'src/app/sitemap.ts',
            /isPublic: true, isDraft: false/,
        ],
        [
            'a visitor without an account cannot open one',
            'src/app/[locale]/recipe/[slug]/page.tsx',
            /!user && \(!recipe\?\.isPublic \|\| recipe\.isDraft\)/,
        ],
    ];

    for (const [what, path, pattern] of musts) {
        check(what, pattern.test(source(path)), `${path} — no match for ${pattern}`);
    }

    /* ------------------------------------------------------- the write side */

    /*
     * The filters above are defence in depth. These three are the actual
     * rules: a draft cannot be made public, cannot be given a share link, and
     * cannot have a post written about it. If these hold, nothing above should
     * ever be reached — which is exactly why they are the ones worth pinning.
     */
    suite('drafts: what cannot be done to one');

    check(
        'making a draft public is refused, conditionally so two requests cannot race',
        /where: \{ id: recipeId, \.\.\.\(parsed\.data\.isPublic \? \{ isDraft: false \} : \{\}\) \}/.test(
            source('src/app/api/recipes/[id]/visibility/route.ts')
        ),
        'visibility route'
    );

    check(
        'but making one private again is never refused',
        /isPublic \? \{ isDraft: false \} : \{\}/.test(
            source('src/app/api/recipes/[id]/visibility/route.ts')
        ),
        'the guard must be one-sided — a draft that somehow went public must be able to come back'
    );

    check(
        'a draft gets no share link',
        /if \(recipe\.isDraft\) \{/.test(source('src/app/api/recipes/[id]/share/route.ts')),
        'share route'
    );

    check(
        'and no post can be written about one',
        /recipes\.some\(\(recipe\) => recipe\.isDraft\)/.test(source('src/lib/postLinks.ts')) &&
            /refusedLinks\(/.test(source('src/app/api/posts/route.ts')) &&
            /refusedLinks\(/.test(source('src/app/api/posts/[id]/route.ts')),
        'posts routes — a post is shareable at /p/<token>, which needs no account, so both creating and editing one check'
    );

    check(
        'finishing a draft is conditional, so pressing twice is not a second write',
        /where: \{ id: recipeId, isDraft: true \}/.test(
            source('src/app/api/recipes/[id]/draft/route.ts')
        ),
        'draft route'
    );

    /*
     * One way only, and this check is the record of that decision rather than
     * a discovery. Going back would mean a public recipe having to un-publish
     * itself and revoke a link somebody may already hold — a lot of machinery,
     * every piece of it a place for a private recipe to stay visible.
     */
    check(
        'and there is no route back to being a draft',
        !/isDraft: true \}[\s,]*\}\)/.test(
            source('src/app/api/recipes/[id]/draft/route.ts').replace(
                /where: \{ id: recipeId, isDraft: true \}/,
                ''
            )
        ),
        'nothing may set isDraft back to true'
    );

    /* ----------------------------------------------------------- the inbox */

    suite('drafts: how one is made');

    const capture = source('src/app/api/capture/[id]/route.ts');

    check(
        'the inbox can take a capture in as a draft',
        /'retry', 'askAi', 'publish', 'stage'/.test(capture),
        'the stage action'
    );
    check(
        'and the flag follows from which button was pressed',
        /isDraft: parsed\.data\.action === 'stage'/.test(capture),
        'capture route'
    );
    check(
        'while publishing directly still exists',
        /'publish'/.test(capture),
        'both paths are kept — a recipe cooked for years does not need a probation period'
    );

    /* ---------------------------------------------------------- the archive */

    suite('drafts: through a backup and back');

    /*
     * An archive written before drafts existed says nothing about them, and
     * everything in it was a finished recipe. So the default has to be false —
     * and the opposite mistake, a draft restored as a recipe, is the backup
     * finishing work nobody did.
     */
    const old = {
        version: 1,
        exportedAt: new Date().toISOString(),
        recipes: [
            {
                title: 'Käsespätzle',
                slug: 'kaesespaetzle',
                description: null,
                instructions: '1. Kochen.',
                category: null,
                nationality: null,
                servings: null,
                prepMinutes: null,
                cookMinutes: null,
                views: 0,
                createdAt: new Date().toISOString(),
                images: [],
                ingredients: [],
            },
        ],
        posts: [],
        collections: [],
        cookEntries: [],
    };

    const parsed = archiveSchema.safeParse(old);
    check('an archive from before drafts still loads', parsed.success, parsed);
    check(
        'and everything in it is a finished recipe',
        parsed.success && parsed.data.recipes[0].isDraft === false,
        parsed.success ? parsed.data.recipes[0] : null
    );

    const withDraft = archiveSchema.safeParse({
        ...old,
        recipes: [{ ...old.recipes[0], isDraft: true }],
    });
    check(
        'a draft stays a draft through an archive',
        withDraft.success && withDraft.data.recipes[0].isDraft === true,
        withDraft.success ? withDraft.data.recipes[0] : null
    );

    check(
        'and the local backup script carries it',
        /isDraft: true,/.test(source('scripts/backup.mjs')),
        'scripts/backup.mjs — losing it would restore every draft as a recipe'
    );
}
