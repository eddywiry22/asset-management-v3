import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Stage 2: Auth foundation data
// ---------------------------------------------------------------------------

const LOCATIONS = [
  { code: 'WH-001', name: 'Main Warehouse',        address: '123 Main Street, Jakarta' },
  { code: 'WH-002', name: 'Secondary Warehouse',   address: '456 Second Avenue, Surabaya' },
  { code: 'WH-003', name: 'Northern Warehouse',    address: '789 North Road, Medan' },
];

const USERS = [
  { email: 'manager1@example.com',  phone: '+62811000001', isAdmin: false },
  { email: 'manager2@example.com',  phone: '+62811000002', isAdmin: false },
  { email: 'manager3@example.com',  phone: '+62811000003', isAdmin: false },
  { email: 'operator1@example.com', phone: '+62822000001', isAdmin: false },
  { email: 'operator2@example.com', phone: '+62822000002', isAdmin: false },
  { email: 'operator3@example.com', phone: '+62822000003', isAdmin: false },
  { email: 'admin@example.com',     phone: '+62800000000', isAdmin: true  },
];

const ROLE_MAP: Array<{ locationCode: string; managerEmail: string; operatorEmail: string }> = [
  { locationCode: 'WH-001', managerEmail: 'manager1@example.com', operatorEmail: 'operator1@example.com' },
  { locationCode: 'WH-002', managerEmail: 'manager2@example.com', operatorEmail: 'operator2@example.com' },
  { locationCode: 'WH-003', managerEmail: 'manager3@example.com', operatorEmail: 'operator3@example.com' },
];

// ---------------------------------------------------------------------------
// Stage 3: Master data
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { name: 'Electronics' },
  { name: 'Office Supplies' },
  { name: 'Furniture' },
];

const VENDORS = [
  { name: 'Tech Supplier Ltd',  contactInfo: 'contact@techsupplier.com' },
  { name: 'OfficeMart',         contactInfo: 'sales@officemart.com' },
  { name: 'FurnitureWorld',     contactInfo: 'info@furnitureworld.com' },
];

const UOMS = [
  { code: 'PCS', name: 'Pieces' },
  { code: 'BOX', name: 'Box' },
  { code: 'KG',  name: 'Kilogram' },
  { code: 'L',   name: 'Liter' },
];

type ProductInput = {
  sku: string;
  name: string;
  categoryName: string;
  vendorName: string;
  uomCode: string;
};

const PRODUCTS: ProductInput[] = [
  // Electronics — Tech Supplier Ltd
  { sku: 'ELEC-001', name: 'Laptop',    categoryName: 'Electronics',    vendorName: 'Tech Supplier Ltd', uomCode: 'PCS' },
  { sku: 'ELEC-002', name: 'Keyboard',  categoryName: 'Electronics',    vendorName: 'Tech Supplier Ltd', uomCode: 'PCS' },
  { sku: 'ELEC-003', name: 'Mouse',     categoryName: 'Electronics',    vendorName: 'Tech Supplier Ltd', uomCode: 'PCS' },
  // Office Supplies — OfficeMart
  { sku: 'OFF-001',  name: 'Printer Paper',      categoryName: 'Office Supplies', vendorName: 'OfficeMart', uomCode: 'BOX' },
  { sku: 'OFF-002',  name: 'Stapler',            categoryName: 'Office Supplies', vendorName: 'OfficeMart', uomCode: 'PCS' },
  { sku: 'OFF-003',  name: 'Whiteboard Marker',  categoryName: 'Office Supplies', vendorName: 'OfficeMart', uomCode: 'BOX' },
  // Furniture — FurnitureWorld
  { sku: 'FURN-001', name: 'Office Chair',   categoryName: 'Furniture', vendorName: 'FurnitureWorld', uomCode: 'PCS' },
  { sku: 'FURN-002', name: 'Desk',           categoryName: 'Furniture', vendorName: 'FurnitureWorld', uomCode: 'PCS' },
  { sku: 'FURN-003', name: 'Filing Cabinet', categoryName: 'Furniture', vendorName: 'FurnitureWorld', uomCode: 'PCS' },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Seed script started ===');

  const passwordHash = await bcrypt.hash('password123', 10);

  // ------------------------------------------------------------------
  // Stage 2: Locations
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Stage 2: Users
  // ------------------------------------------------------------------
  const userMap = new Map<string, string>(); // email → id

  for (const u of USERS) {
    const record = await (prisma.user as any).upsert({
      where:  { email: u.email },
      update: { phone: u.phone, isActive: true, isAdmin: u.isAdmin },
      create: { email: u.email, phone: u.phone, passwordHash, isActive: true, isAdmin: u.isAdmin },
    });
    userMap.set(record.email!, record.id);
    console.log(`  User: ${record.email}${u.isAdmin ? ' [ADMIN]' : ''}`);
  }

  // ------------------------------------------------------------------
  // Stage 2: User-location roles
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Stage 3: Categories
  // ------------------------------------------------------------------
  const categoryMap = new Map<string, string>(); // name → id

  for (const cat of CATEGORIES) {
    const record = await prisma.category.upsert({
      where:  { name: cat.name },
      update: { isActive: true },
      create: { name: cat.name, isActive: true },
    });
    categoryMap.set(record.name, record.id);
    console.log(`  Category: ${record.name}`);
  }

  // ------------------------------------------------------------------
  // Stage 3: Vendors
  // ------------------------------------------------------------------
  const vendorMap = new Map<string, string>(); // name → id

  for (const v of VENDORS) {
    const existing = await prisma.vendor.findFirst({ where: { name: v.name } });
    let record;
    if (existing) {
      record = await prisma.vendor.update({
        where: { id: existing.id },
        data:  { contactInfo: v.contactInfo, isActive: true },
      });
    } else {
      record = await prisma.vendor.create({
        data: { name: v.name, contactInfo: v.contactInfo, isActive: true },
      });
    }
    vendorMap.set(record.name, record.id);
    console.log(`  Vendor: ${record.name}`);
  }

  // ------------------------------------------------------------------
  // Stage 3: UOMs — immutable after creation, never overwrite name
  // ------------------------------------------------------------------
  const uomMap = new Map<string, string>(); // code → id

  for (const uom of UOMS) {
    const record = await prisma.uom.upsert({
      where:  { code: uom.code },
      update: {},  // immutable — never overwrite existing name
      create: { code: uom.code, name: uom.name },
    });
    uomMap.set(record.code, record.id);
    console.log(`  UOM: ${record.code} — ${record.name}`);
  }

  // ------------------------------------------------------------------
  // Stage 3: Products
  // ------------------------------------------------------------------
  for (const p of PRODUCTS) {
    const categoryId = categoryMap.get(p.categoryName)!;
    const vendorId   = vendorMap.get(p.vendorName)!;
    const uomId      = uomMap.get(p.uomCode)!;

    const record = await prisma.product.upsert({
      where:  { sku: p.sku },
      update: { name: p.name, categoryId, vendorId, uomId, isActive: true },
      create: { sku: p.sku, name: p.name, categoryId, vendorId, uomId, isActive: true },
    });
    console.log(`  Product: ${record.sku} — ${record.name}`);
  }

  console.log('');
  console.log('=== Seed completed ===');
  console.log('');
  console.log('Test credentials (all use password: password123)');
  console.log('');
  console.log('  Admin:');
  console.log('    admin@example.com      / password123  [isAdmin: true]');
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
  console.log('');
  console.log('  Master data seeded:');
  console.log('    Categories: Electronics, Office Supplies, Furniture');
  console.log('    Vendors: Tech Supplier Ltd, OfficeMart, FurnitureWorld');
  console.log('    UOMs: PCS, BOX, KG, L');
  console.log('    Products: 9 items (Laptop, Keyboard, Mouse, Printer Paper, Stapler,');
  console.log('              Whiteboard Marker, Office Chair, Desk, Filing Cabinet)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
