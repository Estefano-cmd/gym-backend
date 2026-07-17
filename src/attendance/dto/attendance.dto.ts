import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceMethod } from '@prisma/client';

export class CheckInDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ enum: AttendanceMethod })
  @IsOptional()
  @IsEnum(AttendanceMethod)
  method?: AttendanceMethod;
}
