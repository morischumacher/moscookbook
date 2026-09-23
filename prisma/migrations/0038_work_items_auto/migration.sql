-- Work items the application added by itself, and ones the admin took off
-- the list (kept, so that an automatic one does not come straight back).
ALTER TABLE "WorkItem" ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkItem" ADD COLUMN "dismissedAt" TIMESTAMP(3);
ALTER TABLE "WorkItem" ADD COLUMN "closedReason" TEXT;
