-- Recipes that have been imported and tidied but are not yet one of this
-- cookbook's own.
--
-- Defaults to false, so every recipe that exists today is what it always was.
-- Only the inbox creates drafts, and only when somebody chooses that over
-- publishing directly.
ALTER TABLE "Recipe" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- Every list, count and facet on the front page filters on this, so it is
-- worth an index of its own rather than relying on the table scan being small
-- forever.
CREATE INDEX "Recipe_isDraft_idx" ON "Recipe"("isDraft");
