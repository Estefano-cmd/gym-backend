import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class MigrationExecuteDto {
  @ApiPropertyOptional({ description: 'Ruta local al archivo Excel (solo desarrollo)' })
  @IsOptional()
  @IsString()
  filePath?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean = false;

  @ApiPropertyOptional({ default: false, description: 'Omitir registros ya importados por código' })
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean = true;
}
