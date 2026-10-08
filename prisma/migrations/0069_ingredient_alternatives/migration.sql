-- The cards of a row's alternatives ("Rinderfilet oder Hüfte": Hüfte's), each an ingredient of its own.
ALTER TABLE "Ingredient" ADD COLUMN "altItemIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
CREATE INDEX "Ingredient_altItemIds_idx" ON "Ingredient" USING GIN ("altItemIds");
