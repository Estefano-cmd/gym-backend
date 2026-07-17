import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DurationType } from '@prisma/client';

export class CreateMembershipPlanDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  durationValue: number;

  @ApiProperty({ enum: DurationType })
  @IsEnum(DurationType)
  durationType: DurationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPromotion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  promotionStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  promotionEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;
}

export class UpdateMembershipPlanDto extends CreateMembershipPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
