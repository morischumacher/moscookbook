-- Indexes for the columns the site actually sorts, groups and joins on.
--
-- Recipe had none: no index at all beyond the unique slug, the unique share
-- token and the GIN on the search vector. It is the table the front page sorts
-- by createdAt on every visit, groups by category and nationality on every
-- visit (unconditionally, to build the filter rails, whether or not anybody
-- filtered), and orders by views whenever somebody asks for the popular ones.
-- Every one of those was a sequential scan.
--
-- Rating and Favorite have a unique index that leads with userId, so it cannot
-- serve a lookup by recipe — which is what an average, a rating-sorted page and
-- the cascade behind a recipe deletion all are.
--
-- Capture.recipeId and CookPhoto.userId are the referencing side of a foreign
-- key. Postgres does not index that side, so every recipe deletion scanned
-- Capture and every person deletion scanned CookPhoto.
--
-- CONCURRENTLY is deliberately not used: Prisma runs a migration inside a
-- transaction and CONCURRENTLY cannot be. These tables are small enough that
-- the brief lock is not worth the more complicated path, and they will be
-- small enough for a long time.

CREATE INDEX "Recipe_createdAt_idx" ON "Recipe"("createdAt");
CREATE INDEX "Recipe_views_idx" ON "Recipe"("views");
CREATE INDEX "Recipe_category_idx" ON "Recipe"("category");
CREATE INDEX "Recipe_nationality_idx" ON "Recipe"("nationality");

CREATE INDEX "Rating_recipeId_idx" ON "Rating"("recipeId");
CREATE INDEX "Favorite_recipeId_idx" ON "Favorite"("recipeId");

CREATE INDEX "Capture_recipeId_idx" ON "Capture"("recipeId");
CREATE INDEX "CookPhoto_userId_idx" ON "CookPhoto"("userId");
