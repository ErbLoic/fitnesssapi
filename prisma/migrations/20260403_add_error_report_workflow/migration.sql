-- AlterTable
ALTER TABLE "error_reports"
ADD COLUMN "status" VARCHAR(30) NOT NULL DEFAULT 'nouveau',
ADD COLUMN "workflowStage" VARCHAR(30) NOT NULL DEFAULT 'dev',
ADD COLUMN "ownerName" VARCHAR(100),
ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "error_reports_status_workflowStage_createdAt_idx"
ON "error_reports"("status", "workflowStage", "createdAt");
