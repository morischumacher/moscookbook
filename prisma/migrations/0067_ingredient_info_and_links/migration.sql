-- A row that is another recipe of the cookbook ("Kimchi" in a Kimchi-Pfannkuchen).
ALTER TABLE "Ingredient" ADD COLUMN "linkedRecipeId" INTEGER;
CREATE INDEX "Ingredient_linkedRecipeId_idx" ON "Ingredient"("linkedRecipeId");
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_linkedRecipeId_fkey" FOREIGN KEY ("linkedRecipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- What an ingredient is, per language, shown beside it in every recipe. Null: never looked at.
ALTER TABLE "IngredientItem" ADD COLUMN "infoDe" TEXT, ADD COLUMN "infoEn" TEXT;

-- A unit with no number ("EL Ingwer"), left by the form filling in the usual unit before a number was typed.
UPDATE "Ingredient" SET "raw" = '', "unit" = NULL
WHERE "quantity" IS NULL AND lower(trim("raw")) IN ('g', 'kg', 'ml', 'l', 'el', 'tl', 'zehe', 'zehen', 'bund', 'tbsp', 'tsp', 'clove', 'cloves', 'bunch');
