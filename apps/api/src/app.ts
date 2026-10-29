import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { Database } from './db.js';
import { HealthController } from './health.js';
import { AuthController, AuthService, AdminGuard } from './auth.js';
import { CatalogController, CatalogService } from './catalog.js';
import { ImageController, ImageService, ImageStore } from './images.js';
import { ReferenceController, ReferenceService } from './references.js';

@Module({
  controllers: [
    HealthController,
    AuthController,
    ReferenceController,
    ImageController,
    CatalogController,
  ],
  providers: [
    Database,
    AuthService,
    AdminGuard,
    ReferenceService,
    CatalogService,
    ImageService,
    ImageStore,
  ],
})
export class AppModule {}
