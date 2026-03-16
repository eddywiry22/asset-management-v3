import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed script started...');

  // Locations
  const wh001 = await prisma.location.upsert({
    where: { code: 'WH-001' },
    update: {},
    create: {
      code: 'WH-001',
      name: 'Main Warehouse',
      address: '123 Main Street, Jakarta',
      isActive: true,
    },
  });

  const wh002 = await prisma.location.upsert({
    where: { code: 'WH-002' },
    update: {},
    create: {
      code: 'WH-002',
      name: 'Secondary Warehouse',
      address: '456 Second Avenue, Surabaya',
      isActive: true,
    },
  });

  console.log(`Seeded locations: ${wh001.code}, ${wh002.code}`);

  // Users
  const passwordHash = await bcrypt.hash('password123', 10);

  const manager = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      phone: '+6281234567890',
      passwordHash,
      isActive: true,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: 'operator@example.com' },
    update: {},
    create: {
      email: 'operator@example.com',
      phone: '+6289876543210',
      passwordHash,
      isActive: true,
    },
  });

  console.log(`Seeded users: ${manager.email}, ${operator.email}`);

  // User location roles
  await prisma.userLocationRole.upsert({
    where: { userId_locationId: { userId: manager.id, locationId: wh001.id } },
    update: {},
    create: { userId: manager.id, locationId: wh001.id, role: Role.MANAGER },
  });

  await prisma.userLocationRole.upsert({
    where: { userId_locationId: { userId: manager.id, locationId: wh002.id } },
    update: {},
    create: { userId: manager.id, locationId: wh002.id, role: Role.MANAGER },
  });

  await prisma.userLocationRole.upsert({
    where: { userId_locationId: { userId: operator.id, locationId: wh001.id } },
    update: {},
    create: { userId: operator.id, locationId: wh001.id, role: Role.OPERATOR },
  });

  console.log('Seeded user location roles.');
  console.log('Seed script completed.');
  console.log('');
  console.log('Test credentials:');
  console.log('  manager@example.com  / password123 (MANAGER at WH-001, WH-002)');
  console.log('  operator@example.com / password123 (OPERATOR at WH-001)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
