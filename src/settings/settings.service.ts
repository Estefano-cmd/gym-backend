import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { UpdateSettingsDto } from './dto/setting.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  async update(dto: UpdateSettingsDto, userId: string) {
    const updated = await this.prisma.$transaction(
      dto.settings.map((item) =>
        this.prisma.setting.update({
          where: { key: item.key },
          data: { value: item.value },
        }),
      ),
    );

    await this.audit.log({
      userId,
      action: 'UPDATE',
      entityType: 'settings',
      newData: dto.settings,
    });

    return updated;
  }

  async getPaymentMethods() {
    return this.prisma.paymentMethod.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getValue(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }
}
