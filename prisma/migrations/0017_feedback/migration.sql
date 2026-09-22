-- Somewhere to say what is wrong with the tool.
--
-- A cookbook that two people use every day accumulates small complaints — a
-- button in the wrong place, a thing that takes four taps — and every one of
-- them is worth more than any amount of guessing from the outside. What kills
-- them is the absence of a place to put them: said out loud in a kitchen and
-- gone by morning, or sent as an e-mail into the same inbox as everything
-- else and answered never.
--
-- `path` is the part that earns its keep. "It's broken on the recipe screen, I
-- think" is a conversation; `/de/recipe/gruenes-curry` is a reproduction.
--
-- Nulled rather than cascaded on the author, like a photograph and unlike a
-- reset token: the sentence stays useful without the name, and closing an
-- account should not delete the reason the tool got better.

CREATE TABLE "Feedback" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "path" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- The list, which is "everything still open, newest first".
CREATE INDEX "Feedback_resolvedAt_createdAt_idx" ON "Feedback"("resolvedAt", "createdAt");

-- Postgres does not index the referencing side of a foreign key, so deleting
-- an account would scan this table to find the rows pointing at it.
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
