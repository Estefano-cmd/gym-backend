import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    let database = 'disconnected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      database = 'error';
    }

    return {
      status: 'ok',
      service: 'gym-management-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      timezone: process.env.TZ || 'America/La_Paz',
      database,
    };
  }
}
