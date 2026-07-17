import { Decimal } from '@prisma/client/runtime/library';

export function toNumber(value: Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === 'number' ? value : Number(value);
}

export function serializeDecimals<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === 'object' && value !== null && 'd' in value && 'e' in value && 's' in value
        ? Number(value)
        : value,
    ),
  );
}
