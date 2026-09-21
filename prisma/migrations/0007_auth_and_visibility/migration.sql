-- Two things that belong to the same decision: the cookbook becomes something
-- you sign in to, so signing in has to be recoverable.

-- Addresses become credentials the moment a password can be reset through one,
-- so they get confirmed. Null means unconfirmed, which stays allowed:
-- registration is by invitation, and locking people out of a cookbook because
-- a mail did not arrive is worse than the risk it would remove.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Accounts that exist before this migration were created by someone who was
-- standing there, so they start confirmed rather than being told to prove
-- themselves for something they already did.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "AuthToken" (
    "id"        SERIAL       NOT NULL,
    "tokenHash" TEXT         NOT NULL,
    "purpose"   TEXT         NOT NULL,
    "userId"    INTEGER      NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- Unique, because redeeming has to be a single atomic UPDATE … WHERE rather
-- than a read followed by a write that two clicks can both win.
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

ALTER TABLE "AuthToken"
    ADD CONSTRAINT "AuthToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recipes stop being public. A share token is a second, unguessable address
-- that works without an account — handed to one person, withdrawn by setting
-- this back to null, without the recipe ever changing its own name.
ALTER TABLE "Recipe" ADD COLUMN "shareToken" TEXT;
CREATE UNIQUE INDEX "Recipe_shareToken_key" ON "Recipe"("shareToken");

-- Deliberately not backfilled. Everything that was reachable by anyone with a
-- link becomes private, which is the safe direction for a change of this kind:
-- a recipe that should be shared can be shared again in one click, while a
-- recipe wrongly left public cannot be un-read.
