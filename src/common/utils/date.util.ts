import { DurationType } from '@prisma/client';

export function addDuration(
  start: Date,
  units: number,
  durationValue: number,
  durationType: DurationType,
): Date {
  const result = new Date(start);
  const total = units * durationValue;

  if (durationType === DurationType.DAYS) {
    result.setDate(result.getDate() + total);
  } else {
    result.setMonth(result.getMonth() + total);
  }

  return result;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function computeClientStatus(
  status: string,
  coverageEndDate: Date | null,
): 'ACTIVE' | 'EXPIRED' | 'INACTIVE' | 'SUSPENDED' {
  if (status === 'SUSPENDED') return 'SUSPENDED';
  if (status === 'INACTIVE') return 'INACTIVE';
  if (!coverageEndDate) return 'INACTIVE';
  const today = startOfDay(new Date());
  const end = startOfDay(coverageEndDate);
  return end >= today ? 'ACTIVE' : 'EXPIRED';
}

export function computeAccessStatus(
  status: string,
  coverageEndDate: Date | null,
): 'ALLOWED' | 'DENIED' {
  if (status === 'SUSPENDED') return 'DENIED';
  if (!coverageEndDate) return 'DENIED';
  const today = startOfDay(new Date());
  const end = startOfDay(coverageEndDate);
  return end >= today ? 'ALLOWED' : 'DENIED';
}

export interface CoverageInput {
  currentEndDate: Date | null;
  paymentDate: Date;
  customStartDate?: Date;
  durationUnits: number;
  planDurationValue: number;
  planDurationType: DurationType;
}

export interface CoverageResult {
  previousEndDate: Date | null;
  coverageStartDate: Date;
  coverageEndDate: Date;
}

export function calculateCoverage(input: CoverageInput): CoverageResult {
  const paymentDate = startOfDay(input.paymentDate);
  const today = startOfDay(new Date());
  let coverageStartDate: Date;

  if (
    input.currentEndDate &&
    startOfDay(input.currentEndDate) >= today
  ) {
    const prev = startOfDay(input.currentEndDate);
    coverageStartDate = new Date(prev);
    coverageStartDate.setDate(coverageStartDate.getDate() + 1);
    return {
      previousEndDate: prev,
      coverageStartDate,
      coverageEndDate: addDuration(
        coverageStartDate,
        input.durationUnits,
        input.planDurationValue,
        input.planDurationType,
      ),
    };
  }

  coverageStartDate = input.customStartDate
    ? startOfDay(input.customStartDate)
    : paymentDate;

  return {
    previousEndDate: input.currentEndDate
      ? startOfDay(input.currentEndDate)
      : null,
    coverageStartDate,
    coverageEndDate: addDuration(
      coverageStartDate,
      input.durationUnits,
      input.planDurationValue,
      input.planDurationType,
    ),
  };
}
