-- The public work list: anonymized snapshots the admin chose to hand over.
CREATE TABLE "WorkItem" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "note" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkItem_kind_refId_key" ON "WorkItem"("kind", "refId");
CREATE INDEX "WorkItem_closedAt_createdAt_idx" ON "WorkItem"("closedAt", "createdAt");
