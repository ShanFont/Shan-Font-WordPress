import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  getOptionsToken,
  getStorageToken,
} from '@nestjs/throttler';
import { AdminController, StorageController } from './admin.controller';
import { AuthController } from './auth.controller';
import { ContributorController } from './contributor.controller';
import { HealthController } from './health.controller';
import { AppExceptionFilter, AuthGuard } from './http';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 120) },
    ]),
  ],
  controllers: [
    HealthController,
    AuthController,
    ContributorController,
    AdminController,
    StorageController,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    {
      provide: APP_GUARD,
      useFactory: (options: unknown, storage: unknown, reflector: Reflector) =>
        new ThrottlerGuard(options as never, storage as never, reflector),
      inject: [getOptionsToken(), getStorageToken(), Reflector],
    },
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new AuthGuard(reflector),
      inject: [Reflector],
    },
  ],
})
export class AppModule {}
