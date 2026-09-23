-- Menus for an evening. See `Menu` in schema.prisma.

-- CreateTable
CREATE TABLE "Menu" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "occasion" TEXT,
    "date" TIMESTAMP(3),
    "guests" INTEGER,
    "style" TEXT NOT NULL DEFAULT 'casual',
    "intro" TEXT,
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" SERIAL NOT NULL,
    "menuId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "course" TEXT NOT NULL,
    "recipeId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Menu_slug_key" ON "Menu"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_shareToken_key" ON "Menu"("shareToken");

-- CreateIndex
CREATE INDEX "Menu_date_idx" ON "Menu"("date");

-- CreateIndex
CREATE INDEX "MenuItem_menuId_position_idx" ON "MenuItem"("menuId", "position");

-- CreateIndex
CREATE INDEX "MenuItem_recipeId_idx" ON "MenuItem"("recipeId");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
