-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AttributeKind" AS ENUM ('CHOICE', 'NUMBER');

-- CreateEnum
CREATE TYPE "SupplyStatus" AS ENUM ('DRAFT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CountStatus" AS ENUM ('DRAFT', 'COUNTING', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('RECEIPT', 'SALE', 'CANCELLATION', 'COUNT');

-- CreateTable
CREATE TABLE "Admin" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "adminId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "allowsFraction" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribute" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AttributeKind" NOT NULL,
    "measurementSymbol" TEXT,

    CONSTRAINT "Attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeValue" (
    "id" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "numericValue" DECIMAL(16,4),

    CONSTRAINT "AttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "productId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "valueId" UUID NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("productId","attributeId")
);

-- CreateTable
CREATE TABLE "VariantAttributeValue" (
    "variantId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "valueId" UUID NOT NULL,

    CONSTRAINT "VariantAttributeValue_pkey" PRIMARY KEY ("variantId","attributeId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "productId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "categoryId" UUID NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" UUID NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sellPrice" DECIMAL(14,2),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "productId" UUID NOT NULL,
    "variantId" UUID,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supply" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "SupplyStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Supply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" UUID NOT NULL,
    "supplyId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "unitSymbol" TEXT NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "requestKey" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "customerName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitSymbol" TEXT NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "CountStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "postedAt" TIMESTAMPTZ(3),

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountItem" (
    "id" UUID NOT NULL,
    "countId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "expectedQuantity" DECIMAL(16,3) NOT NULL,
    "expectedRevision" INTEGER NOT NULL,
    "actualQuantity" DECIMAL(16,3),
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "InventoryCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "variantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("variantId","warehouseId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "quantity" DECIMAL(16,3) NOT NULL,
    "supplyItemId" UUID,
    "orderItemId" UUID,
    "countItemId" UUID,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_adminId_idx" ON "Session"("adminId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_symbol_key" ON "Unit"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Attribute_name_key" ON "Attribute"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeValue_attributeId_label_key" ON "AttributeValue"("attributeId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeValue_id_attributeId_key" ON "AttributeValue"("id", "attributeId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_valueId_attributeId_idx" ON "ProductAttributeValue"("valueId", "attributeId");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_valueId_attributeId_idx" ON "VariantAttributeValue"("valueId", "attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ProductTag_tagId_idx" ON "ProductTag"("tagId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_createdAt_id_idx" ON "Product"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_sku_key" ON "Variant"("sku");

-- CreateIndex
CREATE INDEX "Variant_productId_status_idx" ON "Variant"("productId", "status");

-- CreateIndex
CREATE INDEX "Variant_status_sellPrice_id_idx" ON "Variant"("status", "sellPrice", "id");

-- CreateIndex
CREATE INDEX "Variant_unitId_idx" ON "Variant"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_id_productId_key" ON "Variant"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Image_publicId_key" ON "Image"("publicId");

-- CreateIndex
CREATE INDEX "Image_productId_position_idx" ON "Image"("productId", "position");

-- CreateIndex
CREATE INDEX "Image_variantId_productId_idx" ON "Image"("variantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");

-- CreateIndex
CREATE INDEX "Supplier_name_id_idx" ON "Supplier"("name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Supply_reference_key" ON "Supply"("reference");

-- CreateIndex
CREATE INDEX "Supply_warehouseId_status_createdAt_idx" ON "Supply"("warehouseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Supply_supplierId_idx" ON "Supply"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Supply_id_warehouseId_key" ON "Supply"("id", "warehouseId");

-- CreateIndex
CREATE INDEX "SupplyItem_variantId_idx" ON "SupplyItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_supplyId_variantId_key" ON "SupplyItem"("supplyId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_id_variantId_warehouseId_key" ON "SupplyItem"("id", "variantId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_requestKey_key" ON "Order"("requestKey");

-- CreateIndex
CREATE INDEX "Order_warehouseId_status_createdAt_idx" ON "Order"("warehouseId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_warehouseId_key" ON "Order"("id", "warehouseId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_variantId_key" ON "OrderItem"("orderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_id_variantId_warehouseId_key" ON "OrderItem"("id", "variantId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_reference_key" ON "InventoryCount"("reference");

-- CreateIndex
CREATE INDEX "InventoryCount_warehouseId_status_createdAt_idx" ON "InventoryCount"("warehouseId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_id_warehouseId_key" ON "InventoryCount"("id", "warehouseId");

-- CreateIndex
CREATE INDEX "InventoryCountItem_variantId_idx" ON "InventoryCountItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountItem_countId_variantId_key" ON "InventoryCountItem"("countId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountItem_id_variantId_warehouseId_key" ON "InventoryCountItem"("id", "variantId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockBalance_warehouseId_variantId_idx" ON "StockBalance"("warehouseId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_supplyItemId_key" ON "StockMovement"("supplyItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_countItemId_key" ON "StockMovement"("countItemId");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_warehouseId_createdAt_idx" ON "StockMovement"("variantId", "warehouseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_orderItemId_kind_key" ON "StockMovement"("orderItemId", "kind");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "Attribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_valueId_attributeId_fkey" FOREIGN KEY ("valueId", "attributeId") REFERENCES "AttributeValue"("id", "attributeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_valueId_attributeId_fkey" FOREIGN KEY ("valueId", "attributeId") REFERENCES "AttributeValue"("id", "attributeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_variantId_productId_fkey" FOREIGN KEY ("variantId", "productId") REFERENCES "Variant"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_supplyId_warehouseId_fkey" FOREIGN KEY ("supplyId", "warehouseId") REFERENCES "Supply"("id", "warehouseId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_warehouseId_fkey" FOREIGN KEY ("orderId", "warehouseId") REFERENCES "Order"("id", "warehouseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_countId_warehouseId_fkey" FOREIGN KEY ("countId", "warehouseId") REFERENCES "InventoryCount"("id", "warehouseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_warehouseId_fkey" FOREIGN KEY ("variantId", "warehouseId") REFERENCES "StockBalance"("variantId", "warehouseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_supplyItemId_variantId_warehouseId_fkey" FOREIGN KEY ("supplyItemId", "variantId", "warehouseId") REFERENCES "SupplyItem"("id", "variantId", "warehouseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderItemId_variantId_warehouseId_fkey" FOREIGN KEY ("orderItemId", "variantId", "warehouseId") REFERENCES "OrderItem"("id", "variantId", "warehouseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_countItemId_variantId_warehouseId_fkey" FOREIGN KEY ("countItemId", "variantId", "warehouseId") REFERENCES "InventoryCountItem"("id", "variantId", "warehouseId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business constraints that Prisma's schema language cannot represent.
ALTER TABLE "Category" ADD CONSTRAINT "Category_not_own_parent" CHECK ("parentId" IS DISTINCT FROM "id");
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_price" CHECK ("sellPrice" IS NULL OR "sellPrice" > 0),
  ADD CONSTRAINT "Variant_publication_price" CHECK ("status" <> 'PUBLISHED' OR "sellPrice" IS NOT NULL),
  ADD CONSTRAINT "Variant_sku_not_blank" CHECK (length(btrim("sku")) > 0);
CREATE UNIQUE INDEX "Variant_sku_normalized_key" ON "Variant" (upper(btrim("sku")));
CREATE UNIQUE INDEX "Tag_name_normalized_key" ON "Tag" (lower(btrim("name")));
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_name_not_blank" CHECK (length(btrim("name")) > 0);
ALTER TABLE "Image" ADD CONSTRAINT "Image_position" CHECK ("position" >= 0);
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_amounts" CHECK ("quantity" > 0 AND "unitCost" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_amounts" CHECK ("quantity" > 0 AND "unitPrice" > 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_nonnegative" CHECK ("quantity" >= 0 AND "revision" >= 0);
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_amounts" CHECK (
  "expectedQuantity" >= 0 AND "expectedRevision" >= 0 AND ("actualQuantity" IS NULL OR "actualQuantity" >= 0)
);
ALTER TABLE "Supply" ADD CONSTRAINT "Supply_received_timestamp" CHECK (
  ("status" = 'DRAFT' AND "receivedAt" IS NULL) OR ("status" = 'RECEIVED' AND "receivedAt" IS NOT NULL)
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_status_timestamps" CHECK (
  ("status" = 'CONFIRMED' AND "fulfilledAt" IS NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'FULFILLED' AND "fulfilledAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
  ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "fulfilledAt" IS NULL)
);
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_timestamps" CHECK (
  ("status" = 'DRAFT' AND "startedAt" IS NULL AND "postedAt" IS NULL) OR
  ("status" = 'COUNTING' AND "startedAt" IS NOT NULL AND "postedAt" IS NULL) OR
  ("status" = 'POSTED' AND "startedAt" IS NOT NULL AND "postedAt" IS NOT NULL) OR
  ("status" = 'CANCELLED' AND "postedAt" IS NULL)
);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_source_and_sign" CHECK (
  ("kind" = 'RECEIPT' AND "quantity" > 0 AND "supplyItemId" IS NOT NULL AND "orderItemId" IS NULL AND "countItemId" IS NULL) OR
  ("kind" = 'SALE' AND "quantity" < 0 AND "orderItemId" IS NOT NULL AND "supplyItemId" IS NULL AND "countItemId" IS NULL) OR
  ("kind" = 'CANCELLATION' AND "quantity" > 0 AND "orderItemId" IS NOT NULL AND "supplyItemId" IS NULL AND "countItemId" IS NULL) OR
  ("kind" = 'COUNT' AND "quantity" <> 0 AND "countItemId" IS NOT NULL AND "supplyItemId" IS NULL AND "orderItemId" IS NULL)
);
