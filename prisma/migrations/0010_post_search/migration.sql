-- Written entries join the search.
--
-- Same shape as the recipe columns, deliberately: two application-written text
-- columns, a tsvector Postgres derives from them so it cannot fall out of step,
-- and a GIN index. Weighting is the same too — a post *called* Zwetschgen
-- outranks one that merely mentions them.

ALTER TABLE "Post" ADD COLUMN "searchTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "searchBody" TEXT NOT NULL DEFAULT '';

-- Backfilled from the entries' own wording, so search covers what is already
-- written the moment this lands rather than only after `npm run reindex`,
-- which then adds the ae/oe/ue spellings on top.
UPDATE "Post" SET "searchTitle" = "title", "searchBody" = coalesce("body", '');

ALTER TABLE "Post" ADD COLUMN "searchVector" tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('german', coalesce("searchTitle", '')), 'A') ||
        setweight(to_tsvector('german', coalesce("searchBody", '')), 'B')
    ) STORED;

CREATE INDEX "Post_searchVector_idx" ON "Post" USING GIN ("searchVector");
