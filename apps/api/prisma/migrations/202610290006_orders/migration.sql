ALTER TABLE "Order"
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "fulfilledById" UUID,
  ADD COLUMN "cancelledById" UUID,
  ADD COLUMN "cancellationReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Order" ADD CONSTRAINT "Order_fulfilledById_fkey" FOREIGN KEY ("fulfilledById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
