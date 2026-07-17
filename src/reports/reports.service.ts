import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportQueryDto } from './dto/report.dto';
import { toNumber } from '../common/utils/decimal.util';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(query: ReportQueryDto): { from: Date; to: Date } {
    if (query.from && query.to) {
      return { from: new Date(query.from), to: new Date(query.to) };
    }

    const year = query.year ? parseInt(query.year, 10) : new Date().getFullYear();
    const month = query.month ? parseInt(query.month, 10) - 1 : new Date().getMonth();

    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0);
    return { from, to };
  }

  async monthlySummary(query: ReportQueryDto) {
    const { from, to } = this.resolveRange(query);

    const [payments, sales, otherIncomes, expenses, newClients] = await Promise.all([
      this.prisma.membershipPayment.aggregate({
        where: { status: 'CONFIRMED', paymentDate: { gte: from, lte: to } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: { status: 'CONFIRMED', saleDate: { gte: from, lte: to } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      this.prisma.otherIncome.aggregate({
        where: { status: 'CONFIRMED', incomeDate: { gte: from, lte: to } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: { status: 'CONFIRMED', expenseDate: { gte: from, lte: to } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.client.count({
        where: { deletedAt: null, registrationDate: { gte: from, lte: to } },
      }),
    ]);

    const membershipIncome = toNumber(payments._sum.totalAmount);
    const salesIncome = toNumber(sales._sum.totalAmount);
    const otherIncome = toNumber(otherIncomes._sum.amount);
    const totalIncome = membershipIncome + salesIncome + otherIncome;
    const totalExpenses = toNumber(expenses._sum.amount);

    return {
      columns: ['Concepto', 'Monto', 'Cantidad'],
      rows: [
        { Concepto: 'Mensualidades', Monto: membershipIncome, Cantidad: payments._count },
        { Concepto: 'Ventas', Monto: salesIncome, Cantidad: sales._count },
        { Concepto: 'Otros ingresos', Monto: otherIncome, Cantidad: otherIncomes._count },
        { Concepto: 'Egresos', Monto: totalExpenses, Cantidad: expenses._count },
        { Concepto: 'Clientes nuevos', Monto: 0, Cantidad: newClients },
      ],
      summary: {
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
      },
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    };
  }

  async cashFlow(query: ReportQueryDto) {
    const { from, to } = this.resolveRange(query);

    const [payments, sales, otherIncomes, expenses] = await Promise.all([
      this.prisma.membershipPayment.findMany({
        where: { status: 'CONFIRMED', paymentDate: { gte: from, lte: to } },
        select: { paymentDate: true, totalAmount: true, code: true },
        orderBy: { paymentDate: 'asc' },
      }),
      this.prisma.sale.findMany({
        where: { status: 'CONFIRMED', saleDate: { gte: from, lte: to } },
        select: { saleDate: true, totalAmount: true, code: true },
        orderBy: { saleDate: 'asc' },
      }),
      this.prisma.otherIncome.findMany({
        where: { status: 'CONFIRMED', incomeDate: { gte: from, lte: to } },
        select: { incomeDate: true, amount: true, concept: true },
        orderBy: { incomeDate: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { status: 'CONFIRMED', expenseDate: { gte: from, lte: to } },
        select: { expenseDate: true, amount: true, description: true },
        orderBy: { expenseDate: 'asc' },
      }),
    ]);

    const rows = [
      ...payments.map((p) => ({
        Fecha: p.paymentDate.toISOString().slice(0, 10),
        Tipo: 'Ingreso',
        Concepto: `Mensualidad ${p.code}`,
        Monto: toNumber(p.totalAmount),
      })),
      ...sales.map((s) => ({
        Fecha: s.saleDate.toISOString().slice(0, 10),
        Tipo: 'Ingreso',
        Concepto: `Venta ${s.code}`,
        Monto: toNumber(s.totalAmount),
      })),
      ...otherIncomes.map((i) => ({
        Fecha: i.incomeDate.toISOString().slice(0, 10),
        Tipo: 'Ingreso',
        Concepto: i.concept,
        Monto: toNumber(i.amount),
      })),
      ...expenses.map((e) => ({
        Fecha: e.expenseDate.toISOString().slice(0, 10),
        Tipo: 'Egreso',
        Concepto: e.description,
        Monto: -toNumber(e.amount),
      })),
    ].sort((a, b) => a.Fecha.localeCompare(b.Fecha));

    const totalIn = rows.filter((r) => r.Monto > 0).reduce((s, r) => s + r.Monto, 0);
    const totalOut = rows.filter((r) => r.Monto < 0).reduce((s, r) => s + Math.abs(r.Monto), 0);

    return {
      columns: ['Fecha', 'Tipo', 'Concepto', 'Monto'],
      rows,
      summary: { totalIn, totalOut, balance: totalIn - totalOut },
    };
  }

  async inventoryReport() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: { category: true },
      orderBy: { name: 'asc' },
    });

    return {
      columns: ['SKU', 'Producto', 'Categoría', 'Stock', 'Mínimo', 'Precio venta'],
      rows: products.map((p) => ({
        SKU: p.sku,
        Producto: p.name,
        Categoría: p.category.name,
        Stock: p.stock,
        Mínimo: p.minStock,
        'Precio venta': toNumber(p.salePrice),
      })),
      summary: {
        totalProducts: products.length,
        lowStock: products.filter((p) => p.stock <= p.minStock).length,
        totalStockValue: products.reduce(
          (sum, p) => sum + p.stock * toNumber(p.purchasePrice),
          0,
        ),
      },
    };
  }

  async clientsReport(query: ReportQueryDto) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.from || query.to) {
      where.registrationDate = {};
      if (query.from) (where.registrationDate as Record<string, Date>).gte = new Date(query.from);
      if (query.to) (where.registrationDate as Record<string, Date>).lte = new Date(query.to);
    }

    const clients = await this.prisma.client.findMany({
      where,
      include: { currentPlan: true },
      orderBy: { lastName: 'asc' },
    });

    return {
      columns: [
        'Código',
        'Nombre',
        'Estado',
        'Cobertura fin',
        'Plan',
        'Registro',
      ],
      rows: clients.map((c) => ({
        Código: c.code,
        Nombre: `${c.firstName} ${c.lastName}`,
        Estado: c.status,
        'Cobertura fin': c.coverageEndDate?.toISOString().slice(0, 10) ?? '',
        Plan: c.currentPlan?.name ?? '',
        Registro: c.registrationDate.toISOString().slice(0, 10),
      })),
      summary: {
        total: clients.length,
        active: clients.filter((c) => c.status === 'ACTIVE').length,
        expired: clients.filter((c) => c.status === 'EXPIRED').length,
      },
    };
  }

  async generate(query: ReportQueryDto) {
    switch (query.type) {
      case 'monthly-summary':
        return this.monthlySummary(query);
      case 'cash-flow':
        return this.cashFlow(query);
      case 'inventory':
        return this.inventoryReport();
      case 'clients':
        return this.clientsReport(query);
      default:
        return this.monthlySummary(query);
    }
  }

  exportCsv(report: { columns: string[]; rows: Record<string, string | number>[] }) {
    const headers = report.columns;
    const rows = report.rows.map((row) =>
      headers.map((col) => `"${String(row[col] ?? '').replace(/"/g, '""')}"`).join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }
}
