import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryMovementType } from '@prisma/client';

export class CreateInventoryAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ enum: ['POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT', 'LOSS', 'DAMAGED', 'RETURN'] })
  @IsEnum(InventoryMovementType)
  movementType: InventoryMovementType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}
