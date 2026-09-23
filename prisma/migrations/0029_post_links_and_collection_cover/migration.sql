-- An entry can be about several recipes and several collections.
--
-- `Post.recipeId` held at most one. The link moves into join tables, the
-- existing links are copied over at position 0, and the column goes: two
-- places saying which recipe an entry is about is one place too many.

-- CreateTable
CREATE TABLE "PostRecipe" (
    "postId" INTEGER NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PostRecipe_pkey" PRIMARY KEY ("postId","recipeId")
);

-- CreateTable
CREATE TABLE "PostCollection" (
    "postId" INTEGER NOT NULL,
    "collectionId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PostCollection_pkey" PRIMARY KEY ("postId","collectionId")
);

-- CreateIndex
CREATE INDEX "PostRecipe_recipeId_idx" ON "PostRecipe"("recipeId");

-- CreateIndex
CREATE INDEX "PostCollection_collectionId_idx" ON "PostCollection"("collectionId");

-- AddForeignKey
ALTER TABLE "PostRecipe" ADD CONSTRAINT "PostRecipe_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostRecipe" ADD CONSTRAINT "PostRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCollection" ADD CONSTRAINT "PostCollection_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostCollection" ADD CONSTRAINT "PostCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The links that exist today.
INSERT INTO "PostRecipe" ("postId", "recipeId", "position")
SELECT "id", "recipeId", 0 FROM "Post" WHERE "recipeId" IS NOT NULL;

-- DropForeignKey, DropIndex, DropColumn
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_recipeId_fkey";
DROP INDEX IF EXISTS "Post_recipeId_publishedAt_idx";
ALTER TABLE "Post" DROP COLUMN "recipeId";

-- A collection's own picture.
ALTER TABLE "Collection" ADD COLUMN "imageUrl" TEXT;
