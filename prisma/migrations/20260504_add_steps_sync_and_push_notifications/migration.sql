CREATE TABLE IF NOT EXISTS "step_daily_summaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "day" DATE NOT NULL,
  "steps" INTEGER NOT NULL DEFAULT 0,
  "calories" DOUBLE PRECISION,
  "distanceKm" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'app',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "step_daily_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "step_daily_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "step_daily_summaries_user_id_day_source_key"
ON "step_daily_summaries"("userId", "day", "source");

CREATE INDEX IF NOT EXISTS "idx_step_daily_summaries_user_day"
ON "step_daily_summaries"("userId", "day");

CREATE TABLE IF NOT EXISTS "step_sync_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "clientEventId" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "endedAt" TIMESTAMPTZ NOT NULL,
  "steps" INTEGER NOT NULL,
  "rawCounterStart" INTEGER,
  "rawCounterEnd" INTEGER,
  "platform" VARCHAR(20) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'pedometer',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "step_sync_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "step_sync_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "step_sync_events_user_id_client_event_id_key"
ON "step_sync_events"("userId", "clientEventId");

CREATE INDEX IF NOT EXISTS "idx_step_sync_events_user_ended_at"
ON "step_sync_events"("userId", "endedAt");

ALTER TABLE "push_tokens"
ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
ADD COLUMN IF NOT EXISTS "appVersion" TEXT,
ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP INDEX IF EXISTS "push_tokens_userId_token_key";
DROP INDEX IF EXISTS "push_tokens_user_id_token_key";

CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_key"
ON "push_tokens"("token");

CREATE INDEX IF NOT EXISTS "idx_push_tokens_user_id"
ON "push_tokens"("userId");

CREATE INDEX IF NOT EXISTS "idx_push_tokens_enabled"
ON "push_tokens"("enabled");

ALTER TABLE "user_settings"
ADD COLUMN IF NOT EXISTS "notifMessages" BOOLEAN NOT NULL DEFAULT TRUE;
