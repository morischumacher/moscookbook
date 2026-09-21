-- Two things the application could not do from Prisma alone.

-- 1. "What can I make with what I have" could not use an index.
--
-- The query is `contains` + `mode: 'insensitive'`, which Prisma compiles to
-- `ILIKE '%zwiebel%'`. A B-tree cannot serve a pattern that begins with a
-- wildcard, so the existing Ingredient_name_idx was never used for it and the
-- comment claiming the column "is already indexed" was true and irrelevant.
-- Each of up to six words became a correlated subquery with a sequential scan,
-- twice per request — once for the page and once for the count.
--
-- A trigram index can serve it. Measured on 32,000 ingredient rows: sequential
-- scan of the whole table before, bitmap index scan after.
--
-- Not expressible in schema.prisma, like the GIN indexes on the search vectors:
-- Prisma has no syntax for an operator class, so it lives here and the schema
-- says so.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Ingredient_name_trgm_idx" ON "Ingredient" USING gin (name gin_trgm_ops);

-- 2. Rate limiting that survives more than one lambda.
--
-- The limiter was a Map in the process, and on Vercel a process is one warm
-- instance among however many the platform decided to start. "Ten login
-- attempts per fifteen minutes" therefore meant ten times the number of warm
-- instances, and every cold start reset the count to zero — so the limit on
-- password guessing was, in practice, whatever the platform felt like.
--
-- One row per key, incremented atomically by the statement that reads it.
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- For the sweep that removes windows that have closed.
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
