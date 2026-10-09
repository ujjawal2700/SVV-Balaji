import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { countQuery, QUERY_STATS } from '../common/request-stats';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    // Profiling only (PRISMA_QUERY_STATS=1, see common/request-stats.ts). Middleware runs in the
    // caller's async context, so each query is counted against the request that made it.
    if (QUERY_STATS) {
      this.$use(async (params, next) => {
        countQuery();
        return next(params);
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
