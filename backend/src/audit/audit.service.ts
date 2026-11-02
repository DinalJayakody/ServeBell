import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient | PrismaService;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  restaurantId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass a transaction client to make the audit row part of the same commit. */
  record(entry: AuditEntry, tx: Tx = this.prisma) {
    return tx.auditLog.create({ data: entry });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
