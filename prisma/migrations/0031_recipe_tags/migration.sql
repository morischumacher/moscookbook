-- Tags on a recipe, and the index the front page's tag filter uses.
ALTER TABLE "Recipe" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- A GIN index answers `tags @> ARRAY['vegan']` without reading every row.
-- Written by hand, like the search indexes: Prisma's schema cannot say it.
CREATE INDEX "Recipe_tags_idx" ON "Recipe" USING GIN ("tags");
