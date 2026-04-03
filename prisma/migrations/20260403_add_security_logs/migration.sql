-- CreateTable
CREATE TABLE "admin_login_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(255),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "success" BOOLEAN NOT NULL,
    "failureReason" VARCHAR(120),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_failure_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "errorCode" VARCHAR(120),
    "errorMessage" TEXT,
    "userId" VARCHAR(120),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "requestId" VARCHAR(64),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_failure_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_login_attempts_createdAt_idx" ON "admin_login_attempts"("createdAt");

-- CreateIndex
CREATE INDEX "admin_login_attempts_success_createdAt_idx" ON "admin_login_attempts"("success", "createdAt");

-- CreateIndex
CREATE INDEX "admin_login_attempts_ipAddress_createdAt_idx" ON "admin_login_attempts"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "api_failure_logs_createdAt_idx" ON "api_failure_logs"("createdAt");

-- CreateIndex
CREATE INDEX "api_failure_logs_statusCode_createdAt_idx" ON "api_failure_logs"("statusCode", "createdAt");

-- CreateIndex
CREATE INDEX "api_failure_logs_path_createdAt_idx" ON "api_failure_logs"("path", "createdAt");
