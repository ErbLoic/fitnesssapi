DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'step_daily_summaries'
      AND column_name = 'created_at'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'step_daily_summaries'
      AND column_name = 'createdAt'
  ) THEN
    ALTER TABLE "step_daily_summaries" RENAME COLUMN "created_at" TO "createdAt";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'step_daily_summaries'
      AND column_name = 'updated_at'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'step_daily_summaries'
      AND column_name = 'updatedAt'
  ) THEN
    ALTER TABLE "step_daily_summaries" RENAME COLUMN "updated_at" TO "updatedAt";
  END IF;
END $$;
