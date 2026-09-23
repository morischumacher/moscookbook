-- One shopping list for a household: people of the cookbook invited to
-- somebody's list, who use it instead of their own once they accept; and
-- whether the anonymous link may add lines or only tick.
CREATE TABLE "ShoppingListMember" (
    "listId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    CONSTRAINT "ShoppingListMember_pkey" PRIMARY KEY ("listId", "userId")
);
CREATE INDEX "ShoppingListMember_userId_idx" ON "ShoppingListMember"("userId");
-- Somebody shops on one list at a time.
CREATE UNIQUE INDEX "ShoppingListMember_one_accepted" ON "ShoppingListMember"("userId") WHERE "acceptedAt" IS NOT NULL;
ALTER TABLE "ShoppingListMember" ADD CONSTRAINT "ShoppingListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShoppingListMember" ADD CONSTRAINT "ShoppingListMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShoppingList" ADD COLUMN "shareCanAdd" BOOLEAN NOT NULL DEFAULT true;
