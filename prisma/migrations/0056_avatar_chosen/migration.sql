-- When somebody chose their picture (a photo, or their initials). New
-- accounts are asked once before anything else; everybody who already has
-- an account counts as having chosen.
ALTER TABLE "User" ADD COLUMN "avatarChosenAt" TIMESTAMP(3);
UPDATE "User" SET "avatarChosenAt" = CURRENT_TIMESTAMP;
