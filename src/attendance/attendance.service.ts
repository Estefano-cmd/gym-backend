import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CheckInDto } from './dto/attendance.dto';
import { resolvePagination } from '../common/dto/pagination.dto';
import { AttendanceFilterDto } from '../common/dto/filter.dto';
import { paginatedList } from '../common/utils/response.util';
import { startOfDay } from '../common/utils/date.util';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: AttendanceFilterDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Record<string, unknown> = {};

    if (query.clientId) where.clientId = query.clientId;
    if (query.date) {
      where.date = new Date(query.date);
    }

    const [attendances, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip,
        take,
        orderBy: { checkIn: 'desc' },
        include: { client: true, registeredBy: true },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    const items = attendances.map((a) => this.mapAttendance(a));
    return paginatedList(items, total, page, pageSize);
  }

  async findToday() {
    const today = startOfDay(new Date());
    const attendances = await this.prisma.attendance.findMany({
      where: { date: today },
      orderBy: { checkIn: 'desc' },
      include: { client: true },
    });
    return attendances.map((a) => this.mapAttendance(a));
  }

  async checkIn(dto: CheckInDto, userId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (client.status === 'SUSPENDED') {
      throw new ForbiddenException('El cliente está suspendido y no puede ingresar');
    }

    if (client.status === 'INACTIVE' && !client.coverageEndDate) {
      throw new ForbiddenException('El cliente está inactivo');
    }

    const today = startOfDay(new Date());
    if (!client.coverageEndDate || startOfDay(client.coverageEndDate) < today) {
      throw new ForbiddenException('La mensualidad del cliente está vencida');
    }

    if (client.accessStatus === 'DENIED') {
      throw new ForbiddenException('Acceso denegado para este cliente');
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        clientId: dto.clientId,
        date: today,
        checkIn: new Date(),
        method: dto.method ?? 'MANUAL',
        registeredById: userId,
      },
      include: { client: true },
    });

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'attendance',
      entityId: attendance.id,
      newData: { clientId: dto.clientId, method: dto.method },
    });

    return this.mapAttendance(attendance);
  }

  private mapAttendance(attendance: {
    id: string;
    clientId: string;
    date: Date;
    checkIn: Date;
    checkOut: Date | null;
    method: string;
    client?: {
      id: string;
      code: string;
      firstName: string;
      lastName: string;
      status: string;
    };
  }) {
    return {
      id: attendance.id,
      clientId: attendance.clientId,
      client: attendance.client,
      date: attendance.date.toISOString().slice(0, 10),
      checkIn: attendance.checkIn.toISOString(),
      checkOut: attendance.checkOut?.toISOString(),
      method: attendance.method,
    };
  }
}
