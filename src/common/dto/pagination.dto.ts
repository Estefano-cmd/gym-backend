import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export function resolvePagination(dto: PaginationDto) {
  const page = toPositiveInt(dto.page, 1);
  const rawSize = dto.pageSize ?? dto.limit ?? 20;
  const pageSize = Math.min(toPositiveInt(rawSize, 20), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function paginate(page: unknown = 1, limit: unknown = 20) {
  const p = toPositiveInt(page, 1);
  const l = Math.min(toPositiveInt(limit, 20), 100);
  return { skip: (p - 1) * l, take: l };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  return {
    success: true,
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
