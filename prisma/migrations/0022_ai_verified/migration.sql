-- A key is used once it has been seen to work, and not before.

ALTER TABLE "AiCredential" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- Rows that already exist were stored before this rule and have never been
-- tested under it. They are left null deliberately: the screen asks for one
-- press of "test", which is a second of work and the whole point of the
-- column. Backfilling it with the creation date would assert something nobody
-- has checked, in the one field whose meaning is "somebody checked".
