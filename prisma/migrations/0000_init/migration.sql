-- Baseline for PostgreSQL.
--
-- The previous migration in this folder was the original SQLite one, while the
-- schema had long since moved to PostgreSQL; `prisma migrate` could not be run
-- against the real database at all. This replaces it with a baseline that
-- matches the current schema.
--
-- On a database that already exists, mark it as applied once instead of
-- running it:  npx prisma migrate resolve --applied 0_init

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "admin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "nationality" TEXT,
    "category" TEXT,
    "servings" INTEGER,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "recipeId" INTEGER NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION,
    "quantityMax" DOUBLE PRECISION,
    "unit" TEXT,
    "name" TEXT NOT NULL,
    "raw" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" SERIAL NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_slug_key" ON "Recipe"("slug");

-- CreateIndex
CREATE INDEX "Ingredient_name_idx" ON "Ingredient"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_recipeId_position_key" ON "Ingredient"("recipeId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_recipeId_key" ON "Rating"("userId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_recipeId_key" ON "Favorite"("userId", "recipeId");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
