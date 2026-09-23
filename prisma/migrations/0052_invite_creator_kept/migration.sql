-- An invitation outlives the account that made it: deleting that account
-- used to delete its open invitation links without a word, and the
-- "invited by" of everybody who joined through one.
ALTER TABLE "Invite" DROP CONSTRAINT "Invite_createdById_fkey";
ALTER TABLE "Invite" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
