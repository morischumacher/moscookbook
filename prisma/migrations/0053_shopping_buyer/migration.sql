-- Who on a shared list is buying a line.
ALTER TABLE "ShoppingItem" ADD COLUMN "buyerId" INTEGER;
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
