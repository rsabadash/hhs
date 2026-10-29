import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { Database } from './db.js';
import { HealthController } from './health.js';
import { AuthController, AuthService, AdminGuard } from './auth.js';
import { ReferenceController, ReferenceService } from './references.js';

@Module({
  controllers: [HealthController, AuthController, ReferenceController],
  providers: [Database, AuthService, AdminGuard, ReferenceService],
})
export class AppModule {}
