-- How much of a shopping line is for which recipe (lib/shoppingParts).
ALTER TABLE "ShoppingItem" ADD COLUMN "parts" JSONB NOT NULL DEFAULT '[]';

-- The unit an ingredient is bought in, and what one of its other units is in it.
ALTER TABLE "IngredientItem" ADD COLUMN "buyMeasure" TEXT;
ALTER TABLE "IngredientItem" ADD COLUMN "factors" JSONB NOT NULL DEFAULT '{}';
