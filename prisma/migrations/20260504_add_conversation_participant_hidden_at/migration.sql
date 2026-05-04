ALTER TABLE "conversation_participants"
ADD COLUMN "hiddenAt" TIMESTAMPTZ;

CREATE INDEX "conversation_participants_userId_hiddenAt_idx"
ON "conversation_participants"("userId", "hiddenAt");
