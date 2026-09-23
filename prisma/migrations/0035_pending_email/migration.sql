-- A new address waits here until a link sent to it is followed. Until then
-- the old address stays the one the account signs in with and is reset by.
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
