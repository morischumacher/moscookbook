-- A handful of recipes with a name on it: "Weihnachten", "Schnell nach der
-- Arbeit", "Für Tante Elfi".
--
-- Not a second category system. A category says what a dish *is* and there is
-- one right answer; a collection says what a group of dishes is *for*, and a
-- recipe belongs to as many as somebody finds useful. That is why this is a
-- table rather than another column on Recipe.
--
-- Shareable by the same token mechanism as a single recipe, and revoked the
-- same way — which is most of why it is worth building: "here is the Christmas
-- menu" is a thing people actually want to send.

CREATE TABLE "Collection" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");
CREATE UNIQUE INDEX "Collection_shareToken_key" ON "Collection"("shareToken");
CREATE INDEX "Collection_createdAt_idx" ON "Collection"("createdAt");

-- A join table with a position, not an implicit many-to-many: the order of a
-- menu is the point of a menu, and an implicit relation has nowhere to keep it.
CREATE TABLE "CollectionRecipe" (
    "collectionId" INTEGER NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CollectionRecipe_pkey" PRIMARY KEY ("collectionId","recipeId")
);

CREATE INDEX "CollectionRecipe_collectionId_position_idx" ON "CollectionRecipe"("collectionId", "position");

-- Deleting a recipe cascades through here; without this that is a sequential
-- scan, which is the same mistake the other foreign keys had until 0011.
CREATE INDEX "CollectionRecipe_recipeId_idx" ON "CollectionRecipe"("recipeId");

ALTER TABLE "CollectionRecipe" ADD CONSTRAINT "CollectionRecipe_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollectionRecipe" ADD CONSTRAINT "CollectionRecipe_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
