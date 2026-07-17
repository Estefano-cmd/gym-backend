import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOtherIncomeDto {
  @ApiProperty()
  @IsDateString()
  incomeDate: string;

  @ApiProperty()
  @IsString()
  concept: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty()
  @IsUUID()
  paymentMethodId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  origin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;
}

export class UpdateOtherIncomeDto extends CreateOtherIncomeDto {}

export class CancelOtherIncomeDto {
  @ApiProperty()
  @IsString()
  cancellationReason: string;
}

export class CreateIncomeCategoryDto {
  @ApiProperty()
  @IsString()
  name: string;
}
