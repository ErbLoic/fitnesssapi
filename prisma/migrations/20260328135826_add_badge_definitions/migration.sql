-- CreateTable
CREATE TABLE "badge_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "badgeId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "icon" VARCHAR(10) NOT NULL DEFAULT '🏅',
    "category" VARCHAR(50) NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "badge_definitions_badgeId_key" ON "badge_definitions"("badgeId");
