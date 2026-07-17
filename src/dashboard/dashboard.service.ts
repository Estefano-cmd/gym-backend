import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateRangeDto } from './dto/dashboard.dto';
import { startOfDay } from '../common/utils/date.util';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  resolveDateRange(query: DateRangeDto): { from: Date; to: Date } {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;

    if (query.from) {
      return { from: new Date(query.from), to };
    }

    const from = startOfDay(now);
    switch (query.period) {
      case 'today':
        break;
      case 'week':
        from.setDate(from.getDate() - 7);
        break;
      case 'year':
        from.setMonth(0, 1);
        break;
      case 'month':
      default:
        from.setDate(1);
        break;
    }

    return { from, to };
  }

  async getSummary(query: DateRangeDto) {
    const { from, to } = this.resolveDateRange(query);
    const today = startOfDay(new Date());

    const setting = await this.prisma.setting.findUnique({
      where: { key: 'expiry_alert_days' },
    });
    const alertDays = setting ? parseInt(setting.value, 10) : 7;
    const alertDate = new Date(today);
    alertDate.setDate(alertDate.getDate() + alertDays);

    const [
      activeClients,
      expiredClients,
      payments,
      sales,
      otherIncomes,
      expenses,
      todayAttendance,
    ] = await Promise.all([
      this.prisma.client.count({
        where: { deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.client.count({
        where: { deletedAt: null, status: 'EXPIRED' },
      }),
      this.prisma.membershipPayment.aggregate({
        where: {
          status: 'CONFIRMED',
          paymentDate: { gte: from, lte: to },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.sale.aggregate({
        where: {
          status: 'CONFIRMED',
          saleDate: { gte: from, lte: to },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.otherIncome.aggregate({
        where: {
          status: 'CONFIRMED',
          incomeDate: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          status: 'CONFIRMED',
          expenseDate: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.attendance.count({
        where: { date: today },
      }),
    ]);

    const membershipIncome = toNumber(payments._sum.totalAmount);
    const salesIncome = toNumber(sales._sum.totalAmount);
    const otherIncome = toNumber(otherIncomes._sum.amount);
    const monthlyIncome = membershipIncome + salesIncome + otherIncome;
    const monthlyExpenses = toNumber(expenses._sum.amount);

    const pendingPayments = await this.prisma.client.count({
      where: {
        deletedAt: null,
        status: { not: 'SUSPENDED' },
        OR: [
          { coverageEndDate: { lt: today } },
          { coverageEndDate: { lte: alertDate, gte: today } },
        ],
      },
    });

    const lowStockResult = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int as count FROM products
      WHERE deleted_at IS NULL AND is_active = true AND stock <= min_stock
    `;
    const lowStockProducts = Number(lowStockResult[0]?.count ?? 0);

    return {
      activeClients,
      expiredClients,
      monthlyIncome,
      monthlyExpenses,
      todayAttendance,
      pendingPayments,
      lowStockProducts,
      monthlySales: salesIncome,
      netProfit: monthlyIncome - monthlyExpenses,
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    };
  }

  async getIncomeExpenseChart(query: DateRangeDto) {
    const { from, to } = this.resolveDateRange(query);
    const months: { name: string; ingresos: number; egresos: number }[] = [];

    const cursor = new Date(from);
    cursor.setDate(1);

    while (cursor <= to) {
      const monthStart = new Date(cursor);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

      const [payments, sales, otherIncomes, expenses] = await Promise.all([
        this.prisma.membershipPayment.aggregate({
          where: {
            status: 'CONFIRMED',
            paymentDate: { gte: monthStart, lte: monthEnd },
          },
          _sum: { totalAmount: true },
        }),
        this.prisma.sale.aggregate({
          where: {
            status: 'CONFIRMED',
            saleDate: { gte: monthStart, lte: monthEnd },
          },
          _sum: { totalAmount: true },
        }),
        this.prisma.otherIncome.aggregate({
          where: {
            status: 'CONFIRMED',
            incomeDate: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
        }),
        this.prisma.expense.aggregate({
          where: {
            status: 'CONFIRMED',
            expenseDate: { gte: monthStart, lte: monthEnd },
          },
          _sum: { amount: true },
        }),
      ]);

      const ingresos =
        toNumber(payments._sum.totalAmount) +
        toNumber(sales._sum.totalAmount) +
        toNumber(otherIncomes._sum.amount);
      const egresos = toNumber(expenses._sum.amount);

      months.push({
        name: monthStart.toLocaleDateString('es-BO', { month: 'short', year: '2-digit' }),
        ingresos,
        egresos,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }

  async getClientsChart() {
    const statuses = ['ACTIVE', 'EXPIRED', 'INACTIVE', 'SUSPENDED'] as const;
    const labels: Record<string, string> = {
      ACTIVE: 'Activos',
      EXPIRED: 'Vencidos',
      INACTIVE: 'Inactivos',
      SUSPENDED: 'Suspendidos',
    };

    const data = await Promise.all(
      statuses.map(async (status) => ({
        name: labels[status],
        value: await this.prisma.client.count({
          where: { deletedAt: null, status },
        }),
      })),
    );

    return data;
  }

  async getPaymentMethodsChart(query: DateRangeDto) {
    const { from, to } = this.resolveDateRange(query);

    const payments = await this.prisma.membershipPayment.groupBy({
      by: ['paymentMethodId'],
      where: {
        status: 'CONFIRMED',
        paymentDate: { gte: from, lte: to },
      },
      _sum: { totalAmount: true },
    });

    const methods = await this.prisma.paymentMethod.findMany();
    const methodMap = Object.fromEntries(methods.map((m) => [m.id, m.name]));

    return payments.map((p) => ({
      name: methodMap[p.paymentMethodId] ?? 'Desconocido',
      value: toNumber(p._sum.totalAmount),
    }));
  }
}
