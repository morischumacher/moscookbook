-- Written entries: a post with no recipe, or a dated note on one.
--
-- One table, because the two are the same thing written on different days and
-- the difference between them is one nullable column.

CREATE TABLE "Post" (
    "id"          SERIAL       NOT NULL,
    "title"       TEXT         NOT NULL,
    "slug"        TEXT         NOT NULL,
    "body"        TEXT         NOT NULL,
    "imageUrl"    TEXT,
    "publishedAt" TIMESTAMP(3),
    "recipeId"    INTEGER,
    "authorId"    INTEGER,
    "shareToken"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE UNIQUE INDEX "Post_shareToken_key" ON "Post"("shareToken");
CREATE INDEX "Post_publishedAt_idx" ON "Post"("publishedAt");
CREATE INDEX "Post_recipeId_publishedAt_idx" ON "Post"("recipeId", "publishedAt");

-- SET NULL on both, and for the same reason: deleting a recipe or an account
-- must not silently delete something somebody wrote. A note whose recipe is
-- gone becomes an entry of its own.
ALTER TABLE "Post"
    ADD CONSTRAINT "Post_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Post"
    ADD CONSTRAINT "Post_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
