-- The shop aisle an ingredient is in, set by hand on admin → Zutaten; null:
-- by the rules (lib/shopping aisleOf).
ALTER TABLE "IngredientItem" ADD COLUMN "aisle" TEXT;
