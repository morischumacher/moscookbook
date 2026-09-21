-- "I cooked this", with what you would do differently.
--
-- Two ideas that turned out to be one. "When did I last make this" and "note to
-- self: half the chilli next time" are the same moment — you cook it, and what
-- you learned is worth a line. Building them as two features would have meant
-- two buttons and two lists for one act.
--
-- Separate from CookPhoto, which is the picture. A photograph is a thing you
-- took; this is a thing that happened, and most cooking produces the second
-- without the first.

CREATE TABLE "CookLog" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "cookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CookLog_pkey" PRIMARY KEY ("id")
);

-- "When was this last cooked", and the home page's "not made in a while" order.
CREATE INDEX "CookLog_recipeId_cookedAt_idx" ON "CookLog"("recipeId", "cookedAt");

-- One person's own cooking, newest first.
CREATE INDEX "CookLog_userId_cookedAt_idx" ON "CookLog"("userId", "cookedAt");

ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascades, unlike a photograph's author: a picture on a shared wall outlives
-- the account that put it there, a private note about what to change does not.
ALTER TABLE "CookLog" ADD CONSTRAINT "CookLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
