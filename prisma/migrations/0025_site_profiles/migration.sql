-- What we have learned about how one website lays out a recipe.
--
-- Written the first time a model reads a page from a host and can say where it
-- found things; read on every later import from that host, which then needs no
-- model at all.
--
-- Nothing secret is stored here: heading texts and meta tag names, which are
-- facts about a public web page. The table can be dumped into a bug report.
CREATE TABLE "SiteProfile" (
    "host"        TEXT NOT NULL,
    "profile"     TEXT NOT NULL,
    "learnedFrom" TEXT NOT NULL,
    "learnedBy"   TEXT NOT NULL,
    "learnedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt"      TIMESTAMP(3),
    "failures"    INTEGER NOT NULL DEFAULT 0,
    "stale"       BOOLEAN NOT NULL DEFAULT false,
    "lastError"   TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteProfile_pkey" PRIMARY KEY ("host")
);

-- The sweep the admin page will want: which profiles have gone stale, and
-- which have not been used in a long time.
CREATE INDEX "SiteProfile_stale_usedAt_idx" ON "SiteProfile"("stale", "usedAt");
