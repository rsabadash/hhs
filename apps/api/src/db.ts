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
        // Catalog writes can wait behind another administrator's transaction.
        // Keep the query budget below the 30s mutation and 55s HTTP budgets.
        query_timeout: 15000,
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
