import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const LOCATIONS = [
  { code: 'WH-001', name: 'Main Warehouse',        address: '123 Main Street, Jakarta' },
  { code: 'WH-002', name: 'Secondary Warehouse',   address: '456 Second Avenue, Surabaya' },
  { code: 'WH-003', name: 'Northern Warehouse',    address: '789 North Road, Medan' },
];

const USERS = [
  // Per-location managers
  { email: 'manager1@example.com', phone: '+62811000001' },
  { email: 'manager2@example.com', phone: '+62811000002' },
  { email: 'manager3@example.com', phone: '+62811000003' },
  // Per-location operators
  { email: 'operator1@example.com', phone: '+62822000001' },
  { email: 'operator2@example.com', phone: '+62822000002' },
  { email: 'operator3@example.com', phone: '+62822000003' },
  // System admin (global — no location role needed for Stage 2)
  { email: 'admin@example.com', phone: '+62800000000' },
];

// Maps location index → [manager email, operator email]
const ROLE_MAP: Array<{ locationCode: string; managerEmail: string; operatorEmail: string }> = [
  { locationCode: 'WH-001', managerEmail: 'manager1@example.com', operatorEmail: 'operator1@example.com' },
  { locationCode: 'WH-002', managerEmail: 'manager2@example.com', operatorEmail: 'operator2@example.com' },
  { locationCode: 'WH-003', managerEmail: 'manager3@example.com', operatorEmail: 'operator3@example.com' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Seed script started ===');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Locations (upsert — safe to run multiple times)
  const locationMap = new Map<string, string>(); // code → id

  for (const loc of LOCATIONS) {
    const record = await prisma.location.upsert({
      where:  { code: loc.code },
      update: { name: loc.name, address: loc.address, isActive: true },
      create: { code: loc.code, name: loc.name, address: loc.address, isActive: true },
    });
    locationMap.set(record.code, record.id);
    console.log(`  Location: ${record.code} — ${record.name}`);
  }

  // 2. Users (upsert by email — safe to run multiple times)
  const userMap = new Map<string, string>(); // email → id

  for (const u of USERS) {
    const record = await prisma.user.upsert({
      where:  { email: u.email },
      update: { phone: u.phone, isActive: true },
      create: { email: u.email, phone: u.phone, passwordHash, isActive: true },
    });
    userMap.set(record.email!, record.id);
    console.log(`  User: ${record.email}`);
  }

  // 3. User-location roles (upsert on composite unique key)
  for (const mapping of ROLE_MAP) {
    const locationId = locationMap.get(mapping.locationCode)!;
    const managerId  = userMap.get(mapping.managerEmail)!;
    const operatorId = userMap.get(mapping.operatorEmail)!;

    await prisma.userLocationRole.upsert({
      where:  { userId_locationId: { userId: managerId, locationId } },
      update: { role: Role.MANAGER },
      create: { userId: managerId, locationId, role: Role.MANAGER },
    });

    await prisma.userLocationRole.upsert({
      where:  { userId_locationId: { userId: operatorId, locationId } },
      update: { role: Role.OPERATOR },
      create: { userId: operatorId, locationId, role: Role.OPERATOR },
    });

    console.log(`  Roles for ${mapping.locationCode}: MANAGER=${mapping.managerEmail}, OPERATOR=${mapping.operatorEmail}`);
  }

  console.log('');
  console.log('=== Seed completed ===');
  console.log('');
  console.log('Test credentials (all use password: password123)');
  console.log('');
  console.log('  Admin:');
  console.log('    admin@example.com      / password123');
  console.log('');
  console.log('  Managers:');
  console.log('    manager1@example.com   / password123  (MANAGER at WH-001)');
  console.log('    manager2@example.com   / password123  (MANAGER at WH-002)');
  console.log('    manager3@example.com   / password123  (MANAGER at WH-003)');
  console.log('');
  console.log('  Operators:');
  console.log('    operator1@example.com  / password123  (OPERATOR at WH-001)');
  console.log('    operator2@example.com  / password123  (OPERATOR at WH-002)');
  console.log('    operator3@example.com  / password123  (OPERATOR at WH-003)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
