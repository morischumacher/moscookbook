-- A task an assistant reports as done, waiting for the admin to confirm it.
ALTER TABLE "WorkItem" ADD COLUMN "doneAt" TIMESTAMP(3);
ALTER TABLE "WorkItem" ADD COLUMN "doneNote" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "doneRef" TEXT;
