import './env.js';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { readConfig } from './config.js';

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const config = readConfig();
    super({
      adapter: new PrismaPg({
        connectionString: config.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 3000,
        query_timeout: 3000,
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
