-- A finished recipe only the admins see: not the household, no link, not public.
ALTER TABLE "Recipe" ADD COLUMN "onlyMe" BOOLEAN NOT NULL DEFAULT false;
