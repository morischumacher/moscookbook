-- The name an invitation is for: filled into the registration form and not
-- changeable there, so nobody arrives under a name nobody expected.
ALTER TABLE "Invite" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Invite" ADD COLUMN "lastName" TEXT;
