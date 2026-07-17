/**
 * CLI para migrar datos desde Excel al backend
 *
 * Uso:
 *   npm run migration:excel -- --dry-run
 *   npm run migration:excel -- --confirm
 *   npm run migration:excel -- --file "ruta/archivo.xlsm" --confirm
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MigrationService } from '../src/migration/migration.service';
import { PrismaService } from '../src/prisma/prisma.service';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');
  const fileIdx = args.indexOf('--file');
  const filePath =
    fileIdx >= 0
      ? args[fileIdx + 1]
      : path.resolve(
          process.cwd(),
          '../../../Gimnasio_Calistenia_Gestion_v2Final (recuperacion).xlsm',
        );

  if (!confirm && !dryRun) {
    console.log('Uso:');
    console.log('  npm run migration:excel -- --dry-run     # Vista previa');
    console.log('  npm run migration:excel -- --confirm     # Ejecutar migración');
    console.log('  npm run migration:excel -- --file "ruta.xlsm" --confirm');
    process.exit(0);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Archivo no encontrado: ${filePath}`);
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const migration = app.get(MigrationService);
  const prisma = app.get(PrismaService);

  const admin = await prisma.user.findFirst({
    where: { email: 'admin@gimnasio.local', deletedAt: null },
  });

  if (!admin) {
    console.error('❌ Usuario admin no encontrado. Ejecute primero: npm run prisma:seed');
    await app.close();
    process.exit(1);
  }

  console.log(`📂 Archivo: ${filePath}`);
  console.log(dryRun ? '🔍 Modo: dry-run (vista previa)' : '✅ Modo: confirm (importación real)');

  if (dryRun) {
    const preview = await migration.previewFromPath(filePath);
    console.log('\n📊 Resumen:');
    console.log(JSON.stringify(preview.summary, null, 2));
    if (preview.warnings.length) {
      console.log('\n⚠️  Advertencias:');
      preview.warnings.forEach((w) => console.log(`  - ${w}`));
    }
    if (preview.errors.length) {
      console.log(`\n❌ Errores de parseo: ${preview.errors.length}`);
      preview.errors.slice(0, 10).forEach((e) =>
        console.log(`  [${e.sheet} fila ${e.row}] ${e.message}`),
      );
    }
  } else {
    const result = await migration.executeFromPath(
      filePath,
      { dryRun: false, skipDuplicates: true },
      admin.id,
    );
    console.log('\n📊 Resultado:');
    console.log(JSON.stringify({ imported: result.imported, skipped: result.skipped }, null, 2));
    if (result.reportPath) {
      console.log(`\n📄 Reporte: ${result.reportPath}`);
    }
    if (result.errors.length) {
      console.log(`\n⚠️  Errores: ${result.errors.length}`);
      result.errors.slice(0, 10).forEach((e) =>
        console.log(`  [${e.sheet} fila ${e.row}] ${e.message}`),
      );
    }
  }

  await app.close();
  console.log('\n✅ Proceso finalizado');
}

bootstrap().catch((err) => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});
