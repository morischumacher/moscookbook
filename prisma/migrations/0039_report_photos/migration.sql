-- Photos attached to a ticket (by whoever wrote it) or to an error (by the admin).
CREATE TABLE "ReportPhoto" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "ticketId" INTEGER,
    "errorLogId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportPhoto_ticketId_idx" ON "ReportPhoto"("ticketId");
CREATE INDEX "ReportPhoto_errorLogId_idx" ON "ReportPhoto"("errorLogId");

ALTER TABLE "ReportPhoto" ADD CONSTRAINT "ReportPhoto_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportPhoto" ADD CONSTRAINT "ReportPhoto_errorLogId_fkey" FOREIGN KEY ("errorLogId") REFERENCES "ErrorLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Whether the admin chose to publish an item's photos with it.
ALTER TABLE "WorkItem" ADD COLUMN "withPhotos" BOOLEAN NOT NULL DEFAULT false;
