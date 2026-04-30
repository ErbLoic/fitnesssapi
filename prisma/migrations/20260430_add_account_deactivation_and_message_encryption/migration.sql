ALTER TABLE "users"
  ADD COLUMN "isDisabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deactivatedAt" TIMESTAMPTZ,
  ADD COLUMN "scheduledDeletionAt" TIMESTAMPTZ;

CREATE INDEX "users_isDisabled_scheduledDeletionAt_idx" ON "users"("isDisabled", "scheduledDeletionAt");
CREATE INDEX "users_isSystem_idx" ON "users"("isSystem");

INSERT INTO "users" (
  "id",
  "email",
  "passwordHash",
  "name",
  "fitnessLevel",
  "isDisabled",
  "isSystem",
  "onboardingComplete",
  "createdAt",
  "updatedAt"
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  NULL,
  NULL,
  'Utilisateur inconnu',
  'beginner',
  true,
  true,
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO UPDATE SET
  "email" = NULL,
  "passwordHash" = NULL,
  "name" = 'Utilisateur inconnu',
  "isDisabled" = true,
  "isSystem" = true,
  "onboardingComplete" = true,
  "updatedAt" = now();
