import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Database } from './db.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(Database) private readonly database: Database) {}

  @Get('live')
  live() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  async ready() {
    try {
      // Also verifies the schema exists, without returning business data.
      await this.database
        .$queryRaw`SELECT EXISTS(SELECT 1 FROM "Variant"), EXISTS(SELECT 1 FROM "LoginThrottle"), EXISTS(SELECT 1 FROM "ImageCleanup"), EXISTS(SELECT "revision" FROM "Supply"), EXISTS(SELECT "excluded" FROM "InventoryCountItem")`;
      return { status: 'ok' as const };
    } catch {
      throw new ServiceUnavailableException('Service unavailable');
    }
  }
}
