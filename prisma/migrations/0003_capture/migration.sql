-- The capture inbox.
--
-- A capture is written before anything is parsed, so that a share from a phone
-- is durable the moment it arrives. Parsing may then fail without losing what
-- was sent: rawText and imageUrl stay, and the capture can be retried.

CREATE TABLE "Capture" (
    "id"          SERIAL       NOT NULL,
    "kind"        TEXT         NOT NULL,
    "source"      TEXT         NOT NULL,
    "sourceUrl"   TEXT,
    "rawText"     TEXT,
    "imageUrl"    TEXT,
    "note"        TEXT,
    "status"      TEXT         NOT NULL DEFAULT 'new',
    "error"       TEXT,
    "draft"       JSONB,
    "recipeId"    INTEGER,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Capture_pkey" PRIMARY KEY ("id")
);

-- The inbox is read as "everything not yet dealt with, newest first".
CREATE INDEX "Capture_status_createdAt_idx" ON "Capture"("status", "createdAt");

-- Deleting a recipe must not delete the capture it came from: the raw share is
-- the record of where a recipe came from, and is worth keeping on its own.
ALTER TABLE "Capture"
    ADD CONSTRAINT "Capture_recipeId_fkey"
    FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CaptureToken" (
    "id"         SERIAL       NOT NULL,
    "label"      TEXT         NOT NULL,
    "tokenHash"  TEXT         NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt"  TIMESTAMP(3),

    CONSTRAINT "CaptureToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaptureToken_tokenHash_key" ON "CaptureToken"("tokenHash");
