-- Earlier versions of a recipe. See `RecipeRevision` in schema.prisma.

-- CreateTable
CREATE TABLE "RecipeRevision" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "editedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeRevision_recipeId_createdAt_idx" ON "RecipeRevision"("recipeId", "createdAt");

-- AddForeignKey
ALTER TABLE "RecipeRevision" ADD CONSTRAINT "RecipeRevision_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
