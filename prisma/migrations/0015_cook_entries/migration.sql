-- One "I cooked this" instead of two.
--
-- CookPhoto and CookLog were the same row with one column's difference. Both
-- held a person, a recipe, a moment and a line of text; one also held a
-- picture. They produced two headings on the recipe page, two buttons, two
-- lists and two different permission rules for a single act, and the person
-- reading the page could not tell what either section was for.
--
-- This merges them. Nothing is discarded: every photograph keeps its url, and
-- every caption and note survives as text on the entry it belonged to.
--
-- **The merging rule.** One entry per recipe, per person, per day. A caption
-- and a note written by the same person about the same recipe on the same day
-- describe the same evening, so they become one entry with one note; three
-- photographs of that evening become three pictures on it. Where two texts
-- meet they are joined with " · " in the order they were written, rather than
-- one of them being chosen over the other.
--
-- The day is the stored timestamp's date. Timestamps here carry no zone, so
-- this is the same comparison the rest of the schema makes.
-- It can split a very late evening across two entries. That is visible and
-- fixable by hand; picking a timezone the database does not know would not be.
--
-- Rows with no author (photographs whose uploader deleted their account) group
-- together as one anonymous entry per recipe and day, because SQL treats NULLs
-- as equal in GROUP BY and, here, that is the right answer.

CREATE TABLE "CookEntry" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "userId" INTEGER,
    "cookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CookEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CookEntryPhoto" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "entryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookEntryPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CookEntry_recipeId_cookedAt_idx" ON "CookEntry"("recipeId", "cookedAt");
CREATE INDEX "CookEntry_userId_cookedAt_idx" ON "CookEntry"("userId", "cookedAt");
CREATE INDEX "CookEntryPhoto_entryId_position_idx" ON "CookEntryPhoto"("entryId", "position");

ALTER TABLE "CookEntry" ADD CONSTRAINT "CookEntry_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, not Cascade. A contribution on a shared page outlives the account
-- that made it, and becomes "Someone". CookLog cascaded, justified as the note
-- being private to its author — which it never was, since every account could
-- read it. That premise being wrong meant the database was deleting other
-- people's visible contributions when an account went.
ALTER TABLE "CookEntry" ADD CONSTRAINT "CookEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CookEntryPhoto" ADD CONSTRAINT "CookEntryPhoto_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "CookEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every contribution from both tables, in one shape.
--
-- An ordinary table, dropped at the end, rather than a TEMP one: a temporary
-- table's lifetime is tied to the session's transaction, and whether a
-- migration runner gives the whole file one transaction is not something this
-- file should have to assume.
CREATE TABLE "_contribution" AS
SELECT
    'photo'::text                AS kind,
    p."id"                       AS "sourceId",
    p."recipeId",
    p."userId",
    p."createdAt"                AS "ts",
    p."createdAt"::date          AS "day",
    NULLIF(btrim(COALESCE(p."caption", '')), '') AS "text",
    p."url"
FROM "CookPhoto" p
UNION ALL
SELECT
    'log',
    l."id",
    l."recipeId",
    l."userId",
    l."cookedAt",
    l."cookedAt"::date,
    NULLIF(btrim(COALESCE(l."note", '')), ''),
    NULL
FROM "CookLog" l;

-- One entry per recipe, person and day.
--
-- The note is every distinct text from that group, earliest first. DISTINCT ON
-- keeps the first occurrence of each text so that the same caption repeated on
-- three photographs is written once, and the ordering is by when it was
-- written rather than alphabetical.
INSERT INTO "CookEntry" ("recipeId", "userId", "cookedAt", "note")
SELECT
    g."recipeId",
    g."userId",
    g."firstAt",
    g."note"
FROM (
    SELECT
        c."recipeId",
        c."userId",
        MIN(c."ts") AS "firstAt",
        (
            SELECT NULLIF(string_agg(d."text", ' · ' ORDER BY d."ts", d."sourceId"), '')
            FROM (
                SELECT DISTINCT ON (t."text") t."text", t."ts", t."sourceId"
                FROM "_contribution" t
                WHERE t."recipeId" = c."recipeId"
                  AND t."userId" IS NOT DISTINCT FROM c."userId"
                  AND t."day" = c."day"
                  AND t."text" IS NOT NULL
                ORDER BY t."text", t."ts", t."sourceId"
            ) d
        ) AS "note"
    FROM "_contribution" c
    GROUP BY c."recipeId", c."userId", c."day"
) g;

-- The pictures, hung on the entry for their own day.
INSERT INTO "CookEntryPhoto" ("entryId", "url", "position", "createdAt")
SELECT
    e."id",
    c."url",
    (ROW_NUMBER() OVER (PARTITION BY e."id" ORDER BY c."ts", c."sourceId")) - 1,
    c."ts"
FROM "_contribution" c
JOIN "CookEntry" e
  ON  e."recipeId" = c."recipeId"
  AND e."userId" IS NOT DISTINCT FROM c."userId"
  AND e."cookedAt"::date = c."day"
WHERE c."kind" = 'photo';

DROP TABLE "_contribution";
DROP TABLE "CookPhoto";
DROP TABLE "CookLog";
