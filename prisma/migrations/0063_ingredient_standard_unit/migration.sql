-- The unit an ingredient is written in ('g', 'bunch', '' for pieces); null: read off its recipes.
ALTER TABLE "IngredientItem" ADD COLUMN "unit" TEXT;
-- Further kinds of unit allowed for it ("mass", "count:" …): rows in them are no conflict.
ALTER TABLE "IngredientItem" ADD COLUMN "moreUnits" TEXT[] DEFAULT ARRAY[]::TEXT[];
