import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

export interface ExcelClientRow {
  row: number;
  code: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  status?: string;
  goal?: string;
  coverageEndDate?: Date;
}

export interface ExcelPaymentRow {
  row: number;
  code: string;
  clientCode: string;
  clientName: string;
  paymentDate: Date;
  planName: string;
  durationUnits: number;
  amount: number;
  manualAmount?: number;
  paymentMethod?: string;
  reference?: string;
  cancelled: boolean;
  isFirstPayment?: boolean;
}

export interface ExcelIncomeRow {
  row: number;
  incomeDate: Date;
  concept: string;
  amount: number;
  paymentMethod?: string;
  origin?: string;
}

export interface ExcelExpenseRow {
  row: number;
  expenseDate: Date;
  rawCategory: string;
  rawDescription: string;
  amount: number;
  responsible?: string;
}

export interface ParsedExcelData {
  clients: ExcelClientRow[];
  payments: ExcelPaymentRow[];
  incomes: ExcelIncomeRow[];
  expenses: ExcelExpenseRow[];
  parseErrors: { sheet: string; row: number; message: string }[];
}

@Injectable()
export class ExcelParserService {
  parse(buffer: Buffer): ParsedExcelData {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const parseErrors: ParsedExcelData['parseErrors'] = [];

    return {
      clients: this.parseClients(workbook, parseErrors),
      payments: this.parsePayments(workbook, parseErrors),
      incomes: this.parseIncomes(workbook, parseErrors),
      expenses: this.parseExpenses(workbook, parseErrors),
      parseErrors,
    };
  }

  private getSheet(workbook: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
    if (!workbook.SheetNames.includes(name)) return null;
    return workbook.Sheets[name];
  }

  private sheetRows(sheet: XLSX.WorkSheet): unknown[][] {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
  }

  private toDate(value: unknown): Date | null {
    if (!value && value !== 0) return null;
    if (value instanceof Date) return value;

    if (typeof value === 'number' && value > 30000 && value < 60000) {
      const utcDays = Math.floor(value - 25569);
      return new Date(utcDays * 86400 * 1000);
    }

    const str = String(value).trim();
    if (!str) return null;

    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }

    const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      let year = parseInt(parts[3], 10);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  private parseClients(
    workbook: XLSX.WorkBook,
    errors: ParsedExcelData['parseErrors'],
  ): ExcelClientRow[] {
    const sheet = this.getSheet(workbook, 'Clientes');
    if (!sheet) return [];

    const rows = this.sheetRows(sheet);
    const headerIdx = rows.findIndex((r) => r?.[0] === 'ID_Cliente');
    if (headerIdx < 0) {
      errors.push({ sheet: 'Clientes', row: 0, message: 'Cabecera ID_Cliente no encontrada' });
      return [];
    }

    const clients: ExcelClientRow[] = [];
    const seen = new Set<string>();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[0] || !row?.[1]) continue;

      const code = String(row[0]).trim();
      if (!code.startsWith('C')) {
        errors.push({ sheet: 'Clientes', row: i + 1, message: `Código inválido: ${code}` });
        continue;
      }

      if (seen.has(code)) {
        errors.push({ sheet: 'Clientes', row: i + 1, message: `Cliente duplicado: ${code}` });
        continue;
      }
      seen.add(code);

      clients.push({
        row: i + 1,
        code,
        firstName: String(row[1] ?? '').trim(),
        lastName: String(row[2] ?? '').trim(),
        phone: row[3] ? String(row[3]).trim() : undefined,
        email: row[4] ? String(row[4]).trim() : undefined,
        status: row[6] ? String(row[6]).trim() : undefined,
        goal: row[7] ? String(row[7]).trim() : undefined,
        coverageEndDate: this.toDate(row[8]) ?? undefined,
      });
    }

    return clients;
  }

  private parsePayments(
    workbook: XLSX.WorkBook,
    errors: ParsedExcelData['parseErrors'],
  ): ExcelPaymentRow[] {
    const sheet = this.getSheet(workbook, 'Pagos');
    if (!sheet) return [];

    const rows = this.sheetRows(sheet);
    const payments: ExcelPaymentRow[] = [];
    const seen = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const codeRaw = row?.[1];
      if (!codeRaw) continue;

      const code = String(codeRaw).trim();
      if (!code.startsWith('P')) continue;

      if (seen.has(code)) {
        errors.push({ sheet: 'Pagos', row: i + 1, message: `Pago duplicado: ${code}` });
        continue;
      }
      seen.add(code);

      const paymentDate = this.toDate(row[3]);
      if (!paymentDate) {
        errors.push({ sheet: 'Pagos', row: i + 1, message: `Fecha inválida en ${code}` });
        continue;
      }

      const amount = Number(row[7]);
      const manualAmount = row[8] != null ? Number(row[8]) : undefined;
      const finalAmount = !isNaN(manualAmount!) && manualAmount! > 0 ? manualAmount! : amount;

      if (isNaN(finalAmount) || finalAmount < 0) {
        errors.push({ sheet: 'Pagos', row: i + 1, message: `Monto inválido en ${code}` });
        continue;
      }

      const clientCode = row[17] ? String(row[17]).trim() : '';
      if (!clientCode.startsWith('C')) {
        errors.push({ sheet: 'Pagos', row: i + 1, message: `Cliente no vinculado en ${code}` });
        continue;
      }

      const durationUnits = Number(row[6]) || 1;
      const cancelled = String(row[14] ?? '').toUpperCase() === 'SI';

      payments.push({
        row: i + 1,
        code,
        clientCode,
        clientName: String(row[2] ?? '').trim(),
        paymentDate,
        planName: String(row[5] ?? 'Mensual normal').trim(),
        durationUnits: durationUnits > 0 ? Math.round(durationUnits) : 1,
        amount: finalAmount,
        manualAmount,
        paymentMethod: row[9] ? String(row[9]).trim() : undefined,
        reference: row[10] ? String(row[10]).trim() : undefined,
        cancelled,
        isFirstPayment: row[16] === 1 || row[16] === '1',
      });
    }

    return payments;
  }

  private parseIncomes(
    workbook: XLSX.WorkBook,
    errors: ParsedExcelData['parseErrors'],
  ): ExcelIncomeRow[] {
    const sheet = this.getSheet(workbook, 'Ingresos');
    if (!sheet) return [];

    const rows = this.sheetRows(sheet);
    const incomes: ExcelIncomeRow[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[0] || !row?.[1]) continue;

      const incomeDate = this.toDate(row[0]);
      if (!incomeDate) {
        errors.push({ sheet: 'Ingresos', row: i + 1, message: 'Fecha inválida' });
        continue;
      }

      const amount = Number(row[3]);
      if (isNaN(amount) || amount < 0) {
        errors.push({ sheet: 'Ingresos', row: i + 1, message: 'Monto inválido' });
        continue;
      }

      incomes.push({
        row: i + 1,
        incomeDate,
        concept: String(row[1]).trim(),
        amount,
        paymentMethod: row[4] ? String(row[4]).trim() : undefined,
        origin: row[5] ? String(row[5]).trim() : undefined,
      });
    }

    return incomes;
  }

  private parseExpenses(
    workbook: XLSX.WorkBook,
    errors: ParsedExcelData['parseErrors'],
  ): ExcelExpenseRow[] {
    const sheet = this.getSheet(workbook, 'Egresos');
    if (!sheet) return [];

    const rows = this.sheetRows(sheet);
    const expenses: ExcelExpenseRow[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[0]) continue;

      const expenseDate = this.toDate(row[0]);
      if (!expenseDate) {
        errors.push({ sheet: 'Egresos', row: i + 1, message: 'Fecha inválida' });
        continue;
      }

      const amount = Number(row[3]);
      if (isNaN(amount) || amount < 0) {
        errors.push({ sheet: 'Egresos', row: i + 1, message: 'Monto inválido' });
        continue;
      }

      expenses.push({
        row: i + 1,
        expenseDate,
        rawCategory: String(row[1] ?? '').trim(),
        rawDescription: String(row[2] ?? '').trim(),
        amount,
        responsible: row[4] ? String(row[4]).trim() : undefined,
      });
    }

    return expenses;
  }
}
