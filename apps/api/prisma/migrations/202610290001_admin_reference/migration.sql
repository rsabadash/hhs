ALTER TYPE "AttributeKind" ADD VALUE 'TEXT';

-- Shared across processes and restarts; never store emails or IP addresses here.
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "attempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "LoginThrottle_positive_attempts" CHECK ("attempts" > 0)
);
CREATE INDEX "LoginThrottle_expiresAt_idx" ON "LoginThrottle"("expiresAt");
CREATE INDEX "Category_name_id_idx" ON "Category"("name", "id");
