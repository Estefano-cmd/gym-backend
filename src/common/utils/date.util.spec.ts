import { DurationType } from '@prisma/client';
import {
  calculateCoverage,
  computeAccessStatus,
  computeClientStatus,
  addDuration,
  daysBetween,
} from './date.util';

describe('date.util', () => {
  describe('calculateCoverage', () => {
    it('debe iniciar cobertura en fecha de pago si cliente vencido', () => {
      const paymentDate = new Date(2026, 2, 9); // marzo 9 local
      const result = calculateCoverage({
        currentEndDate: new Date(2026, 0, 1),
        paymentDate,
        durationUnits: 1,
        planDurationValue: 1,
        planDurationType: DurationType.MONTHS,
      });
      expect(result.coverageStartDate.getFullYear()).toBe(2026);
      expect(result.coverageStartDate.getMonth()).toBe(2);
      expect(result.coverageStartDate.getDate()).toBe(9);
    });

    it('debe iniciar un día después si cliente con cobertura vigente', () => {
      const futureEnd = new Date();
      futureEnd.setMonth(futureEnd.getMonth() + 1);

      const result = calculateCoverage({
        currentEndDate: futureEnd,
        paymentDate: new Date(),
        durationUnits: 1,
        planDurationValue: 1,
        planDurationType: DurationType.MONTHS,
      });

      const expectedStart = new Date(futureEnd);
      expectedStart.setDate(expectedStart.getDate() + 1);
      expect(result.coverageStartDate.toDateString()).toBe(expectedStart.toDateString());
      expect(result.previousEndDate).not.toBeNull();
    });
  });

  describe('computeClientStatus', () => {
    it('debe retornar EXPIRED si cobertura pasó', () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      expect(computeClientStatus('ACTIVE', past)).toBe('EXPIRED');
    });

    it('debe retornar ACTIVE si cobertura vigente', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      expect(computeClientStatus('ACTIVE', future)).toBe('ACTIVE');
    });

    it('debe retornar SUSPENDED si está suspendido', () => {
      expect(computeClientStatus('SUSPENDED', new Date())).toBe('SUSPENDED');
    });
  });

  describe('computeAccessStatus', () => {
    it('debe denegar acceso si suspendido', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      expect(computeAccessStatus('SUSPENDED', future)).toBe('DENIED');
    });

    it('debe permitir acceso si cobertura vigente', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      expect(computeAccessStatus('ACTIVE', future)).toBe('ALLOWED');
    });
  });

  describe('addDuration', () => {
    it('debe sumar días correctamente', () => {
      const start = new Date(2026, 2, 9);
      const end = addDuration(start, 1, 14, DurationType.DAYS);
      expect(end.getDate()).toBe(23);
      expect(end.getMonth()).toBe(2);
    });

    it('debe sumar meses correctamente', () => {
      const start = new Date(2026, 2, 9);
      const end = addDuration(start, 1, 1, DurationType.MONTHS);
      expect(end.getMonth()).toBe(3);
      expect(end.getDate()).toBe(9);
    });
  });

  describe('daysBetween', () => {
    it('debe calcular días entre fechas', () => {
      expect(daysBetween(new Date(2026, 2, 1), new Date(2026, 2, 8))).toBe(7);
    });
  });
});
