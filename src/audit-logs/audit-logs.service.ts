import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePagination } from '../common/dto/pagination.dto';
import { AuditLogFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AuditLogFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.AuditLogWhereInput = {};

    if (query.userId) where.userId = query.userId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = query.action as AuditAction;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      user: log.user,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      oldData: log.oldData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt.toISOString(),
    }));

    return paginatedList(items, total, page, pageSize);
  }
}
