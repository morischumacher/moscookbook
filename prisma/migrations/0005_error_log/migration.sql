-- Somewhere for failures to be noticed.
--
-- Grouped by fingerprint rather than one row per occurrence: a bug that fires
-- on every page load would otherwise fill the database it is meant to be
-- reported in, and a list of two hundred identical rows is not a list anyone
-- reads.

CREATE TABLE "ErrorLog" (
    "id"          SERIAL       NOT NULL,
    "fingerprint" TEXT         NOT NULL,
    "source"      TEXT         NOT NULL,
    "message"     TEXT         NOT NULL,
    "stack"       TEXT,
    "path"        TEXT,
    "count"       INTEGER      NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"  TIMESTAMP(3),

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- The unique index is what makes the upsert on report an atomic single
-- statement rather than a read followed by a write that can race itself.
CREATE UNIQUE INDEX "ErrorLog_fingerprint_key" ON "ErrorLog"("fingerprint");

-- The list is read as "not dealt with, most recent first".
CREATE INDEX "ErrorLog_resolvedAt_lastSeenAt_idx" ON "ErrorLog"("resolvedAt", "lastSeenAt");
