import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MigrationService } from './migration.service';
import * as path from 'path';
import * as fs from 'fs';

import { MigrationExecuteDto } from './dto/migration.dto';

@ApiTags('Migración')
@Controller('migration')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Get('excel/default-preview')
  @Permissions('settings.manage')
  @ApiOperation({
    summary: 'Vista previa del Excel por defecto del proyecto',
    description: 'Lee el archivo Gimnasio_Calistenia_Gestion_v2Final desde la ruta configurada',
  })
  async defaultPreview() {
    const filePath = this.getDefaultExcelPath();
    const data = await this.migrationService.previewFromPath(filePath);
    return { success: true, data: { ...data, filePath } };
  }

  @Post('excel/preview')
  @Permissions('settings.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!/\.(xlsm|xlsx|xls)$/i.test(file.originalname)) {
          return cb(new BadRequestException('Solo archivos Excel (.xlsm, .xlsx, .xls)') as Error, false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Vista previa de importación desde Excel (dry-run)' })
  async preview(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo Excel requerido');
    const data = await this.migrationService.previewFromBuffer(file.buffer);
    return { success: true, data };
  }

  @Post('excel/execute')
  @Permissions('settings.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ejecutar migración desde Excel subido' })
  async executeUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: MigrationExecuteDto,
    @CurrentUser() user: { id: string },
  ) {
    if (!file) throw new BadRequestException('Archivo Excel requerido');
    const data = await this.migrationService.execute(
      file.buffer,
      { ...dto, dryRun: dto.dryRun ?? false },
      user.id,
    );
    return { success: true, data };
  }

  @Post('excel/execute-path')
  @Permissions('settings.manage')
  @ApiOperation({
    summary: 'Ejecutar migración desde ruta local (desarrollo)',
    description: 'Importa el Excel indicado en filePath o el archivo por defecto del proyecto',
  })
  async executePath(
    @Body() dto: MigrationExecuteDto,
    @CurrentUser() user: { id: string },
  ) {
    const filePath = dto.filePath || this.getDefaultExcelPath();
    const data = await this.migrationService.executeFromPath(filePath, dto, user.id);
    return { success: true, data };
  }

  private getDefaultExcelPath(): string {
    if (process.env.EXCEL_IMPORT_PATH && fs.existsSync(process.env.EXCEL_IMPORT_PATH)) {
      return path.resolve(process.env.EXCEL_IMPORT_PATH);
    }

    const candidates = [
      path.resolve(process.cwd(), '../../../Gimnasio_Calistenia_Gestion_v2Final (recuperacion).xlsm'),
      path.resolve(process.cwd(), '../../Gimnasio_Calistenia_Gestion_v2Final (recuperacion).xlsm'),
      path.resolve(__dirname, '../../../../../Gimnasio_Calistenia_Gestion_v2Final (recuperacion).xlsm'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }

    throw new BadRequestException(
      'No se encontró el archivo Excel. Suba el archivo o configure EXCEL_IMPORT_PATH',
    );
  }
}
