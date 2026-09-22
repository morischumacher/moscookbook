-- The AI keys move out of the environment and into the database, sealed.
--
-- Nothing is migrated in: a key that is in ANTHROPIC_API_KEY on Vercel keeps
-- working from there, and copying it in here would mean writing a secret into
-- a migration file, which is in git, which is the one place it must never be.

CREATE TABLE "AiCredential" (
    "provider"   TEXT NOT NULL,
    "secret"     TEXT NOT NULL,
    "hint"       TEXT NOT NULL,
    "model"      TEXT,
    "enabled"    BOOLEAN NOT NULL DEFAULT true,
    "priority"   INTEGER NOT NULL DEFAULT 10,
    "checkedAt"  TIMESTAMP(3),
    "checkError" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCredential_pkey" PRIMARY KEY ("provider")
);

CREATE INDEX "AiCredential_enabled_priority_idx" ON "AiCredential"("enabled", "priority");

CREATE TABLE "AppSetting" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
