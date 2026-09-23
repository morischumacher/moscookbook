-- One row per call to an AI provider, with the tokens it reported.
CREATE TABLE "AiUsage" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "captureId" INTEGER,
    "source" TEXT,
    "input" INTEGER NOT NULL DEFAULT 0,
    "output" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
CREATE INDEX "AiUsage_captureId_idx" ON "AiUsage"("captureId");
