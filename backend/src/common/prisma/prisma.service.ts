import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { AppConfig } from '../../config/config.module.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.env.DATABASE_URL, max: config.env.DATABASE_POOL_MAX }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
