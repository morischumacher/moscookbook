-- A blog entry and a collection can now be on the open web, the way a recipe
-- already could.
--
-- The cookbook had three states and only said so for recipes: private (an
-- account is needed), a secret link (`/p/…`, `/c/…`, no account), and public
-- (its own address works for anybody). Entries and collections had the first
-- two; the third existed only for recipes, so the share control could not
-- offer the same three stages for everything it shares.
--
-- Both default to false, so nothing that exists today changes what it is.
-- `publishedAt` on Post is a different axis and is untouched: that one says
-- whether an entry is finished and in the blog at all, and this says whether
-- the blog's own address answers without a session.
ALTER TABLE "Post" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Collection" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- Both are read by the sitemap, which asks for "everything the open web may
-- see" and would otherwise scan the table for a column that is false on
-- nearly every row.
CREATE INDEX "Post_isPublic_idx" ON "Post"("isPublic");
CREATE INDEX "Collection_isPublic_idx" ON "Collection"("isPublic");
