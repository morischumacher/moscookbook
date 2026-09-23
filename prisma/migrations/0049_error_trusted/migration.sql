-- Whether an error was seen by the server or by somebody signed in. Only
-- those become tasks by themselves: anybody can post a client report.
ALTER TABLE "ErrorLog" ADD COLUMN "trusted" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ErrorLog" SET "trusted" = true WHERE "source" = 'server';
