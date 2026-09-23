-- A recipe in its second language. See src/lib/recipeTranslation.ts.
ALTER TABLE "Recipe" ADD COLUMN "language" TEXT;

CREATE TABLE "RecipeTranslation" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "ingredients" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecipeTranslation_recipeId_locale_key" ON "RecipeTranslation"("recipeId", "locale");

ALTER TABLE "RecipeTranslation" ADD CONSTRAINT "RecipeTranslation_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The example curry was written in English; saying so lets the form offer
-- the German translation rather than guessing.
UPDATE "Recipe" SET "language" = 'en' WHERE lower(trim("title")) = 'green curry' AND "language" IS NULL;
