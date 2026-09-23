-- More than one shopping list per person: a main list (name null) and named
-- ones, each private or shared on its own. A joined list is now one more of
-- somebody's lists rather than the one they use instead of their own.
DROP INDEX "ShoppingList_userId_key";
CREATE INDEX "ShoppingList_userId_idx" ON "ShoppingList"("userId");
ALTER TABLE "ShoppingList" ADD COLUMN "name" TEXT;
ALTER TABLE "ShoppingList" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "ShoppingList_one_main" ON "ShoppingList"("userId") WHERE "name" IS NULL;

DROP INDEX "ShoppingListMember_one_accepted";
