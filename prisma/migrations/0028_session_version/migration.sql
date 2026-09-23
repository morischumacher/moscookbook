-- Revocable sessions. See `User.sessionVersion` in schema.prisma.
--
-- Every existing cookie carries no version, which is read as 0, so nobody is
-- signed out by this migration.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
