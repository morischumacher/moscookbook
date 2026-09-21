-- Galleries.
--
-- A recipe could always hold several pictures; nothing could order them. Read
-- by id, a gallery reshuffles itself the moment one picture is replaced, so the
-- order the author arranged is stored rather than inferred.

ALTER TABLE "Image" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Existing rows keep the order they already had, which was insertion order.
UPDATE "Image" SET "position" = ordered.rank
FROM (
    SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "recipeId" ORDER BY "id") - 1) AS rank
    FROM "Image"
) AS ordered
WHERE "Image"."id" = ordered."id";

CREATE INDEX "Image_recipeId_position_idx" ON "Image"("recipeId", "position");
