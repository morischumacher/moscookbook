# Mo's Cookbook Development Rules & AI Guidelines

## 0. Core Engineering Principle: Prevent Systemic Issues
- **Prevent Future Issues, Don't Just Patch Symptoms**: When working on any task, error, or feature, the primary goal is always to address the underlying root cause and implement guards that prevent similar problems across the entire application in the future—never just patch the single specific instance.
- **Defensive Boundary Validation**: Always validate response formats and edge cases at system boundaries (e.g. check for HTML error documents in XML/JSON parsers, guard user-agent headers, handle HTTP 403 WAF blocks gracefully).
- **Build Invariants**: Always run full verification (`npm run verify`, which includes linting, tests, Prisma generation, and typechecking) before committing, ensuring no broken syntax or invalid exports reach production.

## 1. Importer & Capture Pipeline Rules
1. **Rule-Based Linked Recipe Fetching**: `fromLinkedRecipe` in `src/lib/captureProcess.ts` must use `RULES_ONLY` when parsing linked URLs from video/post captions. This ensures free JSON-LD extraction without wasting AI tokens or causing transcript replay mismatches in `tests/transcript.test.ts`.
2. **YouTube Subtitle HTML Protection**: `captionText` in `src/lib/youtubeCaptions.ts` must return an empty string `''` if the fetched body is an HTML document (`<!DOCTYPE html>` or `<html>`), preventing 403 or fallback HTML pages from being falsely parsed as video subtitles.
3. **HTTP 403 & WAF Resilience**: `fetchPage` in `src/lib/fetchPage.ts` uses modern Chrome browser headers and supports automatic fallback via reader proxies (`r.jina.ai` or `SCRAPING_PROXY_URL`) when target sites block direct server requests with 403/503 WAF anti-bot pages.
4. **Prisma Type Synchronization**: If Prisma types are out of sync during `npm run verify` / `tsc`, run `npx prisma generate` to rebuild `@prisma/client` types before running typecheck.
5. **Source Link Visibility**: External source links (`RecipeSource` / `sourceUrl`) on recipe pages must only be visible to admin users (`isAdmin === true`). They must never be rendered to regular users or guests on shared recipe pages.


## Phone-first UI
1. **Check every UI change at phone size**: run the app with the seed (`scripts/mobile-seed.ts`) and `npm run check:mobile` (iPhone viewport, touch): it fails on sideways scrolling, content past the right edge, crowded tap targets under 24 px and a sheet reaching below the screen, and photographs every page to `mobile-shots/`. Look at the pictures — the script cannot tell whether a page looks good. CI runs it on every push and keeps the pictures as the `mobile-shots` artifact.
2. **Heights in `dvh`, never `vh`**: on an iPhone Safari's toolbar floats over the bottom of the `vh` screen. A full-screen dialog is `fixed inset-x-0 top-0 h-[100dvh]`, never `fixed inset-0` with its content at the bottom (`check:design` refuses both).

## Ingredient names
1. **One way of writing them**: `Zutat, Zubereitung (Zusatz) (optional)` — `Knoblauch, gehackt (große Zehen) (optional)`, `Garlic, minced (large cloves) (optional)` (`src/lib/ingredientShape.ts`).
2. **A capital first letter in both languages**: every writer goes through `capitalized` (`src/lib/ingredientParts.ts`) — recipe rows via `toStructuredIngredients`, translations via `translationRow`, catalogue cards in `/api/ingredients` and `ingredientDecideDb`. Never tell a language apart by its capitals.
3. **Further names per language**: `IngredientItem.aliases` (German) and `enAliases` (English); a merge or rename keeps each name in its own language.
4. **The form enforces the syntax**: each row has its own fields — Zutat (catalogue names and the cookbook's recipes suggested), Zubereitung, Zusatz and an "Optional" checkbox (`partsOf` / `joinParts` / `withBase` in `ingredientShape.ts`); the stored `item` stays the one string.
5. **Explanations live on the card**: a few words in `IngredientItem.infoDe` / `infoEn` (shown under the ingredient on the recipe page, and found when typed in the form) and more in `aboutDe` / `aboutEn` (opened with "mehr"); null = never looked at, "" = none needed. The AI fills them after a save (`fillInfos`). Imports leave explanations out of the row.
6. **A row can be one of our recipes**: `Ingredient.linkedRecipeId` (checked by `liveLinks` on save), linked on the recipe page for those who may see it.
7. **The translation follows the original row for row** (`followedRows`): moves, inserts and deletes are mirrored; lists that do not line up are left alone.
