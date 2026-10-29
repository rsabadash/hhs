import 'reflect-metadata';
import { OrderController, OrderService } from './orders.js';
import { StorefrontController, StorefrontService } from './storefront.js';
import { Module } from '@nestjs/common';
import { InventoryController, InventoryService } from './inventory.js';
import { Database } from './db.js';
import { HealthController } from './health.js';
import { AuthController, AuthService, AdminGuard } from './auth.js';
import { CatalogController, CatalogService } from './catalog.js';
import { ImageController, ImageService, ImageStore } from './images.js';
import { ReferenceController, ReferenceService } from './references.js';

@Module({
  controllers: [
    OrderController,
    HealthController,
    StorefrontController,
    InventoryController,
    AuthController,
    ReferenceController,
    ImageController,
    CatalogController,
  ],
  providers: [
    OrderService,
    Database,
    StorefrontService,
    InventoryService,
    AuthService,
    AdminGuard,
    ReferenceService,
    CatalogService,
    ImageService,
    ImageStore,
  ],
})
export class AppModule {}
