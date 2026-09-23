-- A shopping list shared with chosen people of the cookbook, who see it
-- beside their own; and whether the anonymous link may add lines or only tick.
CREATE TABLE "ShoppingListMember" (
    "listId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShoppingListMember_pkey" PRIMARY KEY ("listId", "userId")
);
CREATE INDEX "ShoppingListMember_userId_idx" ON "ShoppingListMember"("userId");
ALTER TABLE "ShoppingListMember" ADD CONSTRAINT "ShoppingListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoppingListMember" ADD CONSTRAINT "ShoppingListMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShoppingList" ADD COLUMN "shareCanAdd" BOOLEAN NOT NULL DEFAULT true;
