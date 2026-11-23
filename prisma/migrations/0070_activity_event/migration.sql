-- What somebody else did, waiting to be pushed to the owner's phone (lib/activityPushDb.ts).
CREATE TABLE "ActivityEvent" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "recipeTitle" TEXT,
    "recipeSlug" TEXT,
    "amount" INTEGER,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActivityEvent_sentAt_createdAt_idx" ON "ActivityEvent"("sentAt", "createdAt");
