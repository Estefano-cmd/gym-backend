import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ClientStatus, DurationType, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { ExcelParserService, ParsedExcelData } from './excel-parser.service';
import { calculateCoverage, startOfDay } from '../common/utils/date.util';
import { syncClientCoverage } from '../common/utils/client-coverage.util';
import { MigrationExecuteDto } from './dto/migration.dto';

export interface MigrationPreview {
  summary: {
    clients: { total: number; duplicates: number };
    payments: { total: number; valid: number; cancelled: number; duplicates: number };
    incomes: { total: number };
    expenses: { total: number };
    plans: { existing: number; toCreate: string[] };
    parseErrors: number;
  };
  samples: {
    clients: unknown[];
    payments: unknown[];
    incomes: unknown[];
    expenses: unknown[];
  };
  errors: { sheet: string; row: number; message: string }[];
  warnings: string[];
}

export interface MigrationResult extends MigrationPreview {
  imported: {
    clients: number;
    payments: number;
    incomes: number;
    expenses: number;
    plans: number;
  };
  skipped: {
    clients: number;
    payments: number;
    incomes: number;
    expenses: number;
  };
  dryRun: boolean;
  reportPath?: string;
}

const PLAN_ALIASES: Record<string, string> = {
  Cumpleanhos: 'Plan cumpleaños',
  'promo 6 meses': 'Plan 6 meses',
  '6 meses': 'Plan 6 meses',
  'Plan 2 semanas': 'Plan 2 semanas',
  '2 semanas': 'Plan 2 semanas',
  Trabajador: 'Plan trabajadores',
  Nuevo: 'Plan trabajadores',
  'Nuevo 150': 'Plan trabajadores',
  '15 dias': 'Plan 2 semanas',
  'Promo grupos': 'Promo grupos',
};

const EXPENSE_CATEGORY_SEEDS = [
  'Alquiler',
  'Servicios (agua/luz/internet)',
  'Equipamiento',
  'Mantenimiento',
  'Limpieza',
  'Marketing',
  'Sueldos/Honorarios',
  'Impuestos',
  'Otros',
];

@Injectable()
export class MigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ExcelParserService,
    private readonly audit: AuditService,
  ) {}

  async previewFromPath(filePath: string): Promise<MigrationPreview> {
    const buffer = this.readFile(filePath);
    return this.buildPreview(buffer);
  }

  async previewFromBuffer(buffer: Buffer): Promise<MigrationPreview> {
    return this.buildPreview(buffer);
  }

  async execute(
    buffer: Buffer,
    dto: MigrationExecuteDto,
    userId: string,
    reportDir?: string,
  ): Promise<MigrationResult> {
    const preview = await this.buildPreview(buffer);

    if (dto.dryRun) {
      return {
        ...preview,
        imported: { clients: 0, payments: 0, incomes: 0, expenses: 0, plans: 0 },
        skipped: { clients: 0, payments: 0, incomes: 0, expenses: 0 },
        dryRun: true,
      };
    }

    const data = this.parser.parse(buffer);
    const imported = { clients: 0, payments: 0, incomes: 0, expenses: 0, plans: 0 };
    const skipped = { clients: 0, payments: 0, incomes: 0, expenses: 0 };
    const runtimeErrors: MigrationPreview['errors'] = [...data.parseErrors];

    const adminUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!adminUser) throw new NotFoundException('Usuario no encontrado');

    const paymentMethods = await this.prisma.paymentMethod.findMany();
    const methodMap = new Map(paymentMethods.map((m) => [m.name.toLowerCase(), m.id]));
    const defaultMethodId = methodMap.get('efectivo') ?? paymentMethods[0]?.id;

    const expenseCategories = await this.ensureExpenseCategories();
    const incomeCategory = await this.prisma.incomeCategory.findFirst({
      where: { name: 'Otros' },
    });
    const incomeCategoryId = incomeCategory?.id;

    const planMap = await this.ensurePlans(data, imported);

    const clientIdByCode = new Map<string, string>();

    for (const row of data.clients) {
      const exists = await this.prisma.client.findUnique({ where: { code: row.code } });
      if (exists) {
        if (dto.skipDuplicates) {
          skipped.clients++;
          clientIdByCode.set(row.code, exists.id);
          continue;
        }
        runtimeErrors.push({
          sheet: 'Clientes',
          row: row.row,
          message: `Cliente ya existe: ${row.code}`,
        });
        continue;
      }

      const status = this.mapClientStatus(row.status);
      const registrationDate = row.coverageEndDate ?? new Date();

      const client = await this.prisma.client.create({
        data: {
          code: row.code,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          email: row.email || undefined,
          registrationDate: startOfDay(registrationDate),
          goal: row.goal,
          status,
          accessStatus: 'DENIED',
          createdById: userId,
        },
      });

      clientIdByCode.set(row.code, client.id);
      imported.clients++;
    }

    const activePayments = data.payments
      .filter((p) => !p.cancelled)
      .sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());

    for (const row of activePayments) {
      const exists = await this.prisma.membershipPayment.findUnique({
        where: { code: row.code },
      });
      if (exists) {
        if (dto.skipDuplicates) {
          skipped.payments++;
          continue;
        }
        runtimeErrors.push({
          sheet: 'Pagos',
          row: row.row,
          message: `Pago ya existe: ${row.code}`,
        });
        continue;
      }

      const clientId = clientIdByCode.get(row.clientCode);
      if (!clientId) {
        runtimeErrors.push({
          sheet: 'Pagos',
          row: row.row,
          message: `Cliente ${row.clientCode} no encontrado para ${row.code}`,
        });
        continue;
      }

      const planId = planMap.get(this.normalizePlanName(row.planName));
      if (!planId) {
        runtimeErrors.push({
          sheet: 'Pagos',
          row: row.row,
          message: `Plan no resuelto: ${row.planName}`,
        });
        continue;
      }

      const plan = await this.prisma.membershipPlan.findUnique({ where: { id: planId } });
      if (!plan) continue;

      const paymentMethodId =
        (row.paymentMethod &&
          methodMap.get(row.paymentMethod.toLowerCase())) ||
        defaultMethodId;

      if (!paymentMethodId) {
        runtimeErrors.push({
          sheet: 'Pagos',
          row: row.row,
          message: 'No hay métodos de pago configurados',
        });
        continue;
      }

      try {
        await this.prisma.$transaction(async (tx) => {
          const client = await tx.client.findUnique({ where: { id: clientId } });
          if (!client) throw new Error('Cliente no encontrado');

          const coverage = calculateCoverage({
            currentEndDate: client.coverageEndDate,
            paymentDate: row.paymentDate,
            durationUnits: row.durationUnits,
            planDurationValue: plan.durationValue,
            planDurationType: plan.durationType,
          });

          const priorCount = await tx.membershipPayment.count({
            where: { clientId, status: 'CONFIRMED' },
          });

          const unitPrice =
            row.durationUnits > 0
              ? row.amount / row.durationUnits
              : row.amount;

          await tx.membershipPayment.create({
            data: {
              code: row.code,
              clientId,
              paymentDate: startOfDay(row.paymentDate),
              planId,
              durationUnits: row.durationUnits,
              unitPrice,
              discount: 0,
              totalAmount: row.amount,
              paymentMethodId,
              reference: row.reference,
              previousEndDate: coverage.previousEndDate,
              coverageStartDate: coverage.coverageStartDate,
              coverageEndDate: coverage.coverageEndDate,
              isFirstPayment: priorCount === 0,
              observations: `Importado desde Excel`,
              createdById: userId,
              period: {
                create: {
                  clientId,
                  startDate: coverage.coverageStartDate,
                  endDate: coverage.coverageEndDate,
                },
              },
            },
          });

          await syncClientCoverage(tx, clientId);
        });

        imported.payments++;
      } catch (err) {
        runtimeErrors.push({
          sheet: 'Pagos',
          row: row.row,
          message: `Error en ${row.code}: ${(err as Error).message}`,
        });
      }
    }

    for (const row of data.incomes) {
      try {
        const paymentMethodId =
          (row.paymentMethod &&
            methodMap.get(row.paymentMethod.toLowerCase())) ||
          defaultMethodId;

        if (!paymentMethodId) {
          skipped.incomes++;
          continue;
        }

        await this.prisma.otherIncome.create({
          data: {
            incomeDate: startOfDay(row.incomeDate),
            concept: row.concept,
            categoryId: incomeCategoryId,
            amount: row.amount,
            paymentMethodId,
            origin: row.origin ?? 'Excel',
            observations: 'Importado desde Excel',
            createdById: userId,
          },
        });
        imported.incomes++;
      } catch {
        skipped.incomes++;
      }
    }

    for (const row of data.expenses) {
      try {
        const { categoryId, description } = this.resolveExpense(
          row.rawCategory,
          row.rawDescription,
          expenseCategories,
        );

        await this.prisma.expense.create({
          data: {
            expenseDate: startOfDay(row.expenseDate),
            categoryId,
            description,
            amount: row.amount,
            responsible: row.responsible,
            observations: 'Importado desde Excel',
            createdById: userId,
          },
        });
        imported.expenses++;
      } catch {
        skipped.expenses++;
      }
    }

    await this.updateSequenceCounters(data);

    await this.audit.log({
      userId,
      action: 'CREATE',
      entityType: 'excel_migration',
      newData: { imported, skipped, errors: runtimeErrors.length },
    });

    const result: MigrationResult = {
      ...(await this.buildPreview(buffer)),
      imported,
      skipped,
      dryRun: false,
      errors: [...preview.errors, ...runtimeErrors],
    };

    if (reportDir) {
      result.reportPath = await this.saveReport(reportDir, result);
    }

    return result;
  }

  async executeFromPath(
    filePath: string,
    dto: MigrationExecuteDto,
    userId: string,
  ): Promise<MigrationResult> {
    const buffer = this.readFile(filePath);
    const reportDir = path.dirname(filePath);
    return this.execute(buffer, dto, userId, reportDir);
  }

  private readFile(filePath: string): Buffer {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new NotFoundException(`Archivo no encontrado: ${resolved}`);
    }
    return fs.readFileSync(resolved);
  }

  private async buildPreview(buffer: Buffer): Promise<MigrationPreview> {
    const data = this.parser.parse(buffer);
    const warnings: string[] = [];

    const existingClients = await this.prisma.client.findMany({
      where: { code: { in: data.clients.map((c) => c.code) } },
      select: { code: true },
    });
    const existingPayments = await this.prisma.membershipPayment.findMany({
      where: { code: { in: data.payments.map((p) => p.code) } },
      select: { code: true },
    });

    const clientDupes = existingClients.length;
    const paymentDupes = existingPayments.length;

    const planNames = [
      ...new Set(data.payments.filter((p) => !p.cancelled).map((p) => p.planName.trim())),
    ];
    const existingPlans = await this.prisma.membershipPlan.findMany({
      where: { deletedAt: null },
    });
    const existingPlanNames = new Set(
      existingPlans.map((p) => this.normalizePlanName(p.name)),
    );

    const toCreatePlans = planNames.filter(
      (n) => !existingPlanNames.has(this.normalizePlanName(n)) &&
        !existingPlanNames.has(this.normalizePlanName(PLAN_ALIASES[n] ?? n)),
    );

    if (data.payments.some((p) => !p.paymentMethod)) {
      warnings.push('Algunos pagos no tienen método de pago; se usará Efectivo por defecto');
    }

    const cancelled = data.payments.filter((p) => p.cancelled).length;

    return {
      summary: {
        clients: { total: data.clients.length, duplicates: clientDupes },
        payments: {
          total: data.payments.length,
          valid: data.payments.length - cancelled,
          cancelled,
          duplicates: paymentDupes,
        },
        incomes: { total: data.incomes.length },
        expenses: { total: data.expenses.length },
        plans: { existing: existingPlans.length, toCreate: toCreatePlans },
        parseErrors: data.parseErrors.length,
      },
      samples: {
        clients: data.clients.slice(0, 3),
        payments: data.payments.filter((p) => !p.cancelled).slice(0, 3),
        incomes: data.incomes.slice(0, 3),
        expenses: data.expenses.slice(0, 3),
      },
      errors: data.parseErrors,
      warnings,
    };
  }

  private normalizePlanName(name: string): string {
    return name.trim().toLowerCase();
  }

  private mapClientStatus(status?: string): ClientStatus {
    if (!status) return ClientStatus.INACTIVE;
    const s = status.toLowerCase();
    if (s === 'activo') return ClientStatus.ACTIVE;
    if (s === 'suspendido') return ClientStatus.SUSPENDED;
    if (s === 'vencido') return ClientStatus.EXPIRED;
    return ClientStatus.INACTIVE;
  }

  private async ensurePlans(
    data: ParsedExcelData,
    imported: MigrationResult['imported'],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const existing = await this.prisma.membershipPlan.findMany({
      where: { deletedAt: null },
    });

    for (const plan of existing) {
      map.set(this.normalizePlanName(plan.name), plan.id);
    }

    const paymentsByPlan = new Map<string, { amount: number; units: number }>();
    for (const p of data.payments.filter((x) => !x.cancelled)) {
      const key = this.normalizePlanName(p.planName);
      if (!paymentsByPlan.has(key)) {
        paymentsByPlan.set(key, { amount: p.amount, units: p.durationUnits });
      }
    }

    const uniqueNames = [...new Set(data.payments.map((p) => p.planName.trim()))];

    for (const rawName of uniqueNames) {
      const normalized = this.normalizePlanName(rawName);
      if (map.has(normalized)) continue;

      const alias = PLAN_ALIASES[rawName];
      if (alias && map.has(this.normalizePlanName(alias))) {
        map.set(normalized, map.get(this.normalizePlanName(alias))!);
        continue;
      }

      const sample = paymentsByPlan.get(normalized);
      const price = sample
        ? sample.units > 0
          ? sample.amount / sample.units
          : sample.amount
        : 0;

      const { durationValue, durationType } = this.inferDuration(rawName, sample?.units);

      const created = await this.prisma.membershipPlan.create({
        data: {
          name: rawName.trim(),
          price,
          durationValue,
          durationType,
          description: 'Plan importado desde Excel',
          isPromotion: /promo/i.test(rawName),
        },
      });

      map.set(normalized, created.id);
      imported.plans++;
    }

    return map;
  }

  private inferDuration(
    planName: string,
    units?: number,
  ): { durationValue: number; durationType: DurationType } {
    const name = planName.toLowerCase();
    if (name.includes('2 semanas') || name.includes('15 dias')) {
      return { durationValue: name.includes('15') ? 15 : 14, durationType: DurationType.DAYS };
    }
    if (name.includes('6 meses') || (units && units >= 6 && name.includes('mes'))) {
      return { durationValue: units ?? 6, durationType: DurationType.MONTHS };
    }
    if (name.includes('3 meses') || (units === 3)) {
      return { durationValue: 3, durationType: DurationType.MONTHS };
    }
    return { durationValue: 1, durationType: DurationType.MONTHS };
  }

  private async ensureExpenseCategories(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const name of EXPENSE_CATEGORY_SEEDS) {
      const cat = await this.prisma.expenseCategory.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      map.set(name.toLowerCase(), cat.id);
    }
    return map;
  }

  private resolveExpense(
    rawCategory: string,
    rawDescription: string,
    categories: Map<string, string>,
  ): { categoryId: string; description: string } {
    const seedNames = EXPENSE_CATEGORY_SEEDS.map((s) => s.toLowerCase());

    let categoryName = 'Otros';
    let description = rawDescription || rawCategory;

    if (seedNames.includes(rawCategory.toLowerCase())) {
      categoryName = EXPENSE_CATEGORY_SEEDS.find(
        (s) => s.toLowerCase() === rawCategory.toLowerCase(),
      )!;
      description = rawDescription || rawCategory;
    } else if (seedNames.includes(rawDescription.toLowerCase())) {
      categoryName = EXPENSE_CATEGORY_SEEDS.find(
        (s) => s.toLowerCase() === rawDescription.toLowerCase(),
      )!;
      description = rawCategory;
    } else {
      const combined = `${rawCategory} ${rawDescription}`.toLowerCase();
      if (/limpieza|lmpieza/.test(combined)) categoryName = 'Limpieza';
      else if (/alquiler/.test(combined)) categoryName = 'Alquiler';
      else if (/sueldo|honorario/.test(combined)) categoryName = 'Sueldos/Honorarios';
      else if (/marketing|marquet/.test(combined)) categoryName = 'Marketing';
      else if (/impuesto/.test(combined)) categoryName = 'Impuestos';
      else if (/agua|luz|internet|servicio/.test(combined))
        categoryName = 'Servicios (agua/luz/internet)';
      else if (
        /equip|barras|mancuernas|rack|reloj|duchas|steps|trineo|cortina|porta|sante|papel|alargador|jabon/i.test(
          combined,
        )
      )
        categoryName = 'Equipamiento';
      else if (/manten/.test(combined)) categoryName = 'Mantenimiento';

      description =
        rawDescription && rawCategory !== rawDescription
          ? `${rawCategory} - ${rawDescription}`
          : rawCategory || rawDescription;
    }

    const categoryId = categories.get(categoryName.toLowerCase())!;
    return { categoryId, description };
  }

  private async updateSequenceCounters(data: ParsedExcelData) {
    const maxClient = this.maxNumericCode(data.clients.map((c) => c.code), 'C');
    const maxPayment = this.maxNumericCode(
      data.payments.map((p) => p.code),
      'P',
    );

    if (maxClient > 0) {
      await this.prisma.sequenceCounter.upsert({
        where: { name: 'client' },
        update: { lastValue: maxClient },
        create: { name: 'client', prefix: 'C', lastValue: maxClient },
      });
    }

    if (maxPayment > 0) {
      await this.prisma.sequenceCounter.upsert({
        where: { name: 'payment' },
        update: { lastValue: maxPayment },
        create: { name: 'payment', prefix: 'P', lastValue: maxPayment },
      });
    }
  }

  private maxNumericCode(codes: string[], prefix: string): number {
    let max = 0;
    for (const code of codes) {
      if (!code.startsWith(prefix)) continue;
      const num = parseInt(code.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
    return max;
  }

  private async saveReport(dir: string, result: MigrationResult): Promise<string> {
    const reportPath = path.join(
      dir,
      `import-report-${Date.now()}.json`,
    );
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf-8');
    return reportPath;
  }
}
