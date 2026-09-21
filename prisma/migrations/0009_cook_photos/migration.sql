-- Photographs of the dish as somebody actually cooked it.
--
-- Separate from "Image", which is the recipe's own photography. This is the
-- other thing a cookbook is for: proof that a recipe has been made, by people
-- who are not the author.

CREATE TABLE "CookPhoto" (
    "id"        SERIAL       NOT NULL,
    "url"       TEXT         NOT NULL,
    "caption"   TEXT,
    "recipeId"  INTEGER      NOT NULL,
    "userId"    INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CookPhoto_recipeId_createdAt_idx" ON "CookPhoto"("recipeId", "createdAt");

-- CASCADE here, unlike Post's SET NULL, and the difference is deliberate: a
-- written entry stands on its own once its recipe is gone, while a picture of a
-- dish with no dish attached has nowhere to be shown and nothing to say.
ALTER TABLE "CookPhoto"
    ADD CONSTRAINT "CookPhoto_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL, so deleting an account keeps the pictures it left behind.
ALTER TABLE "CookPhoto"
    ADD CONSTRAINT "CookPhoto_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
