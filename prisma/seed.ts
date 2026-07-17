import {
  PrismaClient,
  DurationType,
  SettingType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLES = [
  { name: 'Administrador', slug: 'admin', description: 'Acceso completo al sistema' },
  { name: 'Recepción', slug: 'reception', description: 'Clientes, mensualidades y ventas' },
  { name: 'Contabilidad', slug: 'accounting', description: 'Ingresos, egresos y reportes' },
  { name: 'Entrenador', slug: 'trainer', description: 'Consulta básica de clientes activos' },
];

const PERMISSIONS = [
  { name: 'Acceso completo', slug: 'all', module: 'system' },
  { name: 'Gestionar clientes', slug: 'clients.manage', module: 'clients' },
  { name: 'Ver clientes', slug: 'clients.read', module: 'clients' },
  { name: 'Gestionar pagos', slug: 'payments.manage', module: 'payments' },
  { name: 'Ver pagos', slug: 'payments.read', module: 'payments' },
  { name: 'Gestionar ventas', slug: 'sales.manage', module: 'sales' },
  { name: 'Gestionar productos', slug: 'products.manage', module: 'products' },
  { name: 'Gestionar inventario', slug: 'inventory.manage', module: 'inventory' },
  { name: 'Gestionar compras', slug: 'purchases.manage', module: 'purchases' },
  { name: 'Gestionar ingresos', slug: 'incomes.manage', module: 'incomes' },
  { name: 'Gestionar egresos', slug: 'expenses.manage', module: 'expenses' },
  { name: 'Ver reportes', slug: 'reports.read', module: 'reports' },
  { name: 'Gestionar usuarios', slug: 'users.manage', module: 'users' },
  { name: 'Gestionar configuración', slug: 'settings.manage', module: 'settings' },
  { name: 'Registrar asistencia', slug: 'attendance.manage', module: 'attendance' },
  { name: 'Ver dashboard', slug: 'dashboard.read', module: 'dashboard' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['all'],
  reception: [
    'clients.manage', 'clients.read', 'payments.manage', 'payments.read',
    'sales.manage', 'products.manage', 'attendance.manage', 'dashboard.read',
  ],
  accounting: [
    'incomes.manage', 'expenses.manage', 'reports.read', 'dashboard.read',
    'purchases.manage', 'clients.read', 'payments.read',
  ],
  trainer: ['clients.read', 'attendance.manage', 'dashboard.read'],
};

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'QR', 'Tarjeta', 'Otro'];

const EXPENSE_CATEGORIES = [
  'Alquiler',
  'Servicios (agua/luz/internet)',
  'Equipamiento',
  'Mantenimiento',
  'Limpieza',
  'Marketing',
  'Sueldos/Honorarios',
  'Impuestos',
  'Otros',
];

const PRODUCT_CATEGORIES = [
  'Bebidas',
  'Agua',
  'Productos Sante',
  'Productos Moov',
  'Otros productos deportivos',
];

const INCOME_CATEGORIES = [
  'Venta de productos',
  'Servicios adicionales',
  'Eventos',
  'Otros',
];

const MEMBERSHIP_PLANS = [
  { name: 'Mensual normal', description: 'Mensualidad estándar', price: 320, durationValue: 1, durationType: DurationType.MONTHS },
  { name: 'Promoción', description: 'Promoción general', price: 250, durationValue: 1, durationType: DurationType.MONTHS, isPromotion: true },
  { name: 'Promo Enero', description: 'Promoción de enero', price: 120, durationValue: 1, durationType: DurationType.MONTHS, isPromotion: true },
  { name: 'Promo de carnaval', description: 'Promoción de carnaval', price: 350, durationValue: 1, durationType: DurationType.MONTHS, isPromotion: true },
  { name: 'Plan Fundador', description: 'Mensualidad inicial para fundadores', price: 280, durationValue: 1, durationType: DurationType.MONTHS },
  { name: 'Becas', description: 'Beca para influencers', price: 0, durationValue: 1, durationType: DurationType.MONTHS },
  { name: 'Promo 3 meses', description: 'Promoción de 3 meses', price: 800, durationValue: 3, durationType: DurationType.MONTHS, isPromotion: true },
  { name: 'Promo grupos', description: 'Promoción para grupos', price: 240, durationValue: 1, durationType: DurationType.MONTHS, isPromotion: true },
  { name: 'Plan 2 semanas', description: 'Plan de 2 semanas', price: 140, durationValue: 14, durationType: DurationType.DAYS },
  { name: 'Plan 6 meses', description: 'Plan semestral', price: 1500, durationValue: 6, durationType: DurationType.MONTHS },
  { name: 'Plan trabajadores', description: 'Plan para trabajadores', price: 220, durationValue: 1, durationType: DurationType.MONTHS },
  { name: 'Plan cumpleaños', description: 'Promoción de cumpleaños', price: 200, durationValue: 1, durationType: DurationType.MONTHS, isPromotion: true },
];

const SETTINGS = [
  { key: 'gym_name', value: 'Gimnasio de Calistenia', type: SettingType.STRING },
  { key: 'gym_address', value: 'La Paz, Bolivia', type: SettingType.STRING },
  { key: 'gym_phone', value: '', type: SettingType.STRING },
  { key: 'currency', value: 'Bs', type: SettingType.STRING },
  { key: 'timezone', value: 'America/La_Paz', type: SettingType.STRING },
  { key: 'expiry_alert_days', value: '7', type: SettingType.NUMBER },
  { key: 'allow_negative_stock', value: 'false', type: SettingType.BOOLEAN },
  { key: 'client_code_prefix', value: 'C', type: SettingType.STRING },
  { key: 'payment_code_prefix', value: 'P', type: SettingType.STRING },
  { key: 'sale_code_prefix', value: 'V', type: SettingType.STRING },
  { key: 'purchase_code_prefix', value: 'CO', type: SettingType.STRING },
];

const SEQUENCE_COUNTERS = [
  { name: 'client', prefix: 'C', lastValue: 0 },
  { name: 'payment', prefix: 'P', lastValue: 0 },
  { name: 'sale', prefix: 'V', lastValue: 0 },
  { name: 'purchase', prefix: 'CO', lastValue: 0 },
];

async function main() {
  console.log('🌱 Iniciando seed...');

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: {},
      create: role,
    });
  }

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { slug: perm.slug },
      update: {},
      create: perm,
    });
  }

  const roles = await prisma.role.findMany();
  const permissions = await prisma.permission.findMany();
  const permMap = Object.fromEntries(permissions.map((p) => [p.slug, p.id]));
  const roleMap = Object.fromEntries(roles.map((r) => [r.slug, r.id]));

  for (const [roleSlug, permSlugs] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleSlug];
    for (const permSlug of permSlugs) {
      const permissionId = permMap[permSlug];
      if (roleId && permissionId) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId } },
          update: {},
          create: { roleId, permissionId },
        });
      }
    }
  }

  for (const name of PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of PRODUCT_CATEGORIES) {
    await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of INCOME_CATEGORIES) {
    await prisma.incomeCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const plan of MEMBERSHIP_PLANS) {
    const existing = await prisma.membershipPlan.findFirst({ where: { name: plan.name } });
    if (!existing) {
      await prisma.membershipPlan.create({ data: plan });
    }
  }

  for (const setting of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  for (const counter of SEQUENCE_COUNTERS) {
    await prisma.sequenceCounter.upsert({
      where: { name: counter.name },
      update: {},
      create: counter,
    });
  }

  const passwordHash = await bcrypt.hash('Admin123*', 12);
  const adminRoleId = roleMap['admin'];

  const admin = await prisma.user.upsert({
    where: { email: 'admin@gimnasio.local' },
    update: {},
    create: {
      email: 'admin@gimnasio.local',
      passwordHash,
      firstName: 'Administrador',
      lastName: 'Sistema',
      status: 'ACTIVE',
    },
  });

  if (adminRoleId) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: adminRoleId } },
      update: {},
      create: { userId: admin.id, roleId: adminRoleId },
    });
  }

  console.log('✅ Seed completado');
  console.log('   Usuario: admin@gimnasio.local');
  console.log('   Contraseña: Admin123*');
  console.log('   ⚠️  Cambiar credenciales en producción');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
