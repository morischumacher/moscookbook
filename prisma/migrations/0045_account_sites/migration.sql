-- Which website a social account keeps its recipes on. See src/lib/authorSite.ts.
CREATE TABLE "AccountSite" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountSite_platform_handle_key" ON "AccountSite"("platform", "handle");
