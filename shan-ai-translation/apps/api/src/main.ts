import 'reflect-metadata';
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { log } from './log';

async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/node');
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0 });
  }
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3000', credentials: true });
  const port = Number(process.env.API_PORT || 3001);
  await app.listen(port);
  log('info', 'api listening', { port });
}

bootstrap().catch((error) => {
  log('error', 'api failed to start', { name: error instanceof Error ? error.name : 'unknown' });
  process.exit(1);
});
