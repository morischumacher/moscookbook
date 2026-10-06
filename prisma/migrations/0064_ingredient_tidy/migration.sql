-- When an ingredient was last seen in a recipe or on a shopping list (set by the daily tidy-up),
-- and whether the admin ever changed it by hand: an unused leftover nobody touched goes after 30 days.
ALTER TABLE "IngredientItem" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "IngredientItem" ADD COLUMN "handEdited" BOOLEAN NOT NULL DEFAULT false;
