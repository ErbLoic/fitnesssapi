-- CreateTable
CREATE TABLE "custom_programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "level" VARCHAR(30),
    "goal" VARCHAR(50),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_program_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "programId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_program_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_program_exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dayId" UUID NOT NULL,
    "exerciseId" VARCHAR(100),
    "customExerciseName" VARCHAR(255),
    "position" INTEGER NOT NULL DEFAULT 0,
    "targetSets" INTEGER,
    "targetReps" VARCHAR(50),
    "targetWeight" DOUBLE PRECISION,
    "restSeconds" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_program_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_session_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "programId" UUID,
    "programDayId" UUID,
    "source" VARCHAR(20) NOT NULL DEFAULT 'free',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "isFinished" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,
    "lastSavedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "exercises" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_session_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_programs_userId_updatedAt_idx" ON "custom_programs"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "custom_programs_userId_deletedAt_idx" ON "custom_programs"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "custom_program_days_programId_position_idx" ON "custom_program_days"("programId", "position");

-- CreateIndex
CREATE INDEX "custom_program_exercises_dayId_position_idx" ON "custom_program_exercises"("dayId", "position");

-- CreateIndex
CREATE INDEX "workout_session_drafts_userId_status_lastSavedAt_idx" ON "workout_session_drafts"("userId", "status", "lastSavedAt");

-- CreateIndex
CREATE INDEX "workout_session_drafts_programId_idx" ON "workout_session_drafts"("programId");

-- One unfinished draft/active session per user. Finished/abandoned history remains untouched.
CREATE UNIQUE INDEX "workout_session_drafts_one_active_per_user_idx"
ON "workout_session_drafts"("userId")
WHERE "status" IN ('draft', 'active') AND "isFinished" = false;

-- AddForeignKey
ALTER TABLE "custom_programs"
ADD CONSTRAINT "custom_programs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_program_days"
ADD CONSTRAINT "custom_program_days_programId_fkey"
FOREIGN KEY ("programId") REFERENCES "custom_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_program_exercises"
ADD CONSTRAINT "custom_program_exercises_dayId_fkey"
FOREIGN KEY ("dayId") REFERENCES "custom_program_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_drafts"
ADD CONSTRAINT "workout_session_drafts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_drafts"
ADD CONSTRAINT "workout_session_drafts_programId_fkey"
FOREIGN KEY ("programId") REFERENCES "custom_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_session_drafts"
ADD CONSTRAINT "workout_session_drafts_programDayId_fkey"
FOREIGN KEY ("programDayId") REFERENCES "custom_program_days"("id") ON DELETE SET NULL ON UPDATE CASCADE;
