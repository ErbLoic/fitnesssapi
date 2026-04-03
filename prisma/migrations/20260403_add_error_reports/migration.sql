-- CreateTable
CREATE TABLE "error_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "pagePath" VARCHAR(255) NOT NULL,
    "additionalInfo" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_reports_userId_createdAt_idx" ON "error_reports"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "error_reports" ADD CONSTRAINT "error_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
