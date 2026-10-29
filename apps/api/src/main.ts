import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.js';
import { readConfig } from './config.js';

async function main() {
  const { PORT } = readConfig();
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableShutdownHooks();
  await app.listen(PORT, '0.0.0.0');
}
main().catch(() => {
  console.error('API startup failed. Check configuration and service logs.');
  process.exitCode = 1;
});
