-- German full text search.
--
-- The two text columns are written by the application (searchFields() in
-- src/lib/searchText.ts). The tsvector is derived by Postgres from them, so it
-- can never fall out of step, and the GIN index makes the search a lookup
-- rather than a scan.
--
-- Weighting: a recipe called "Zwiebelsuppe" should outrank one that merely
-- lists an onion, so the title is weight A and everything else weight B.

ALTER TABLE "Recipe" ADD COLUMN "searchTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Recipe" ADD COLUMN "searchBody" TEXT NOT NULL DEFAULT '';

-- Backfill with the recipes' own wording, so search works the moment this
-- migration lands rather than only after the reindex script has been run.
-- `npm run reindex` then adds the ae/oe/ue spellings on top.
UPDATE "Recipe" SET
    "searchTitle" = "title",
    "searchBody" = concat_ws(
        ' ',
        coalesce("description", ''),
        coalesce(
            (SELECT string_agg(i."name", ' ' ORDER BY i."position")
             FROM "Ingredient" i WHERE i."recipeId" = "Recipe"."id"),
            ''
        ),
        coalesce("instructions", '')
    );

ALTER TABLE "Recipe" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('german', coalesce("searchTitle", '')), 'A') ||
        setweight(to_tsvector('german', coalesce("searchBody", '')), 'B')
    ) STORED;

CREATE INDEX "Recipe_searchVector_idx" ON "Recipe" USING GIN ("searchVector");
