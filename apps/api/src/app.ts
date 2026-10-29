import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { Database } from './db.js';
import { HealthController } from './health.js';

@Module({ controllers: [HealthController], providers: [Database] })
export class AppModule {}
