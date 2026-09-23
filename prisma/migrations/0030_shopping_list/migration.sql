-- A shopping list per person. See `ShoppingList` in schema.prisma.

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "shareToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" SERIAL NOT NULL,
    "listId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "measure" TEXT,
    "amount" DOUBLE PRECISION,
    "aisle" TEXT NOT NULL,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingList_userId_key" ON "ShoppingList"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShoppingList_shareToken_key" ON "ShoppingList"("shareToken");

-- CreateIndex
CREATE INDEX "ShoppingItem_listId_checked_idx" ON "ShoppingItem"("listId", "checked");

-- AddForeignKey
ALTER TABLE "ShoppingList" ADD CONSTRAINT "ShoppingList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
