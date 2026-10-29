CREATE TABLE "ImageCleanup" (
  "publicId" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ImageCleanup_createdAt_idx" ON "ImageCleanup"("createdAt");
CREATE INDEX "Product_name_id_idx" ON "Product"("name", "id");
