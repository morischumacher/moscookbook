-- Tips & notes on a recipe (work #32): markdown like the method, shown
-- after it, and translated with the rest of the recipe. "" when there are
-- none, so every recipe written before stays exactly as it was.
ALTER TABLE "Recipe" ADD COLUMN "tips" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RecipeTranslation" ADD COLUMN "tips" TEXT NOT NULL DEFAULT '';
