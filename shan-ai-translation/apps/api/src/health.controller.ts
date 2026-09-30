import { Controller, Get } from '@nestjs/common';
import { prisma } from '@sat/database';
import { Public } from './http';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  async health() {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}
