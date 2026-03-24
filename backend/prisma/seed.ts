import { PrismaClient, Role, LedgerSourceType } from '@prisma/client';
import bcrypt from 'bcrypt';

const now = new Date();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

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
  { username: 'manager1',  email: 'manager1@example.com',  phone: '+62811000001', isAdmin: false },
  { username: 'manager2',  email: 'manager2@example.com',  phone: '+62811000002', isAdmin: false },
  { username: 'manager3',  email: 'manager3@example.com',  phone: '+62811000003', isAdmin: false },
  { username: 'operator1', email: 'operator1@example.com', phone: '+62822000001', isAdmin: false },
  { username: 'operator2', email: 'operator2@example.com', phone: '+62822000002', isAdmin: false },
  { username: 'operator3', email: 'operator3@example.com', phone: '+62822000003', isAdmin: false },
  { username: 'admin',     email: 'admin@example.com',     phone: '+62800000000', isAdmin: true  },
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
    const record = await prisma.user.upsert({
      where:  { email: u.email },
      update: { username: u.username, phone: u.phone, isActive: true, isAdmin: u.isAdmin },
      create: { username: u.username, email: u.email, phone: u.phone, passwordHash, isActive: true, isAdmin: u.isAdmin },
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
  // Stage 3: Products — isActive removed; ProductLocation is the source of truth
  // ------------------------------------------------------------------
  for (const p of PRODUCTS) {
    const categoryId = categoryMap.get(p.categoryName)!;
    const vendorId   = vendorMap.get(p.vendorName)!;
    const uomId      = uomMap.get(p.uomCode)!;

    const record = await prisma.product.upsert({
      where:  { sku: p.sku },
      update: { name: p.name, categoryId, vendorId, uomId },
      create: { sku: p.sku, name: p.name, categoryId, vendorId, uomId },
    });
    console.log(`  Product: ${record.sku} — ${record.name}`);
  }

  // ------------------------------------------------------------------
  // M2: ProductLocation matrix — backfill, then activate all for testing
  // Must run BEFORE stock seeding so all pairs are active when stock is created.
  // ------------------------------------------------------------------
  console.log('');
  console.log('Backfilling ProductLocation matrix...');

  const allProducts  = await prisma.product.findMany({ select: { id: true, sku: true } });
  const allLocations = await prisma.location.findMany({ select: { id: true, code: true } });

  const before = await prisma.productLocation.count();
  console.log(`  Before backfill: ${before} rows`);

  await prisma.productLocation.createMany({
    data: allProducts.flatMap((product) =>
      allLocations.map((loc) => ({
        productId:  product.id,
        locationId: loc.id,
        isActive:   false,
      }))
    ),
    skipDuplicates: true,
  });

  const afterBackfill = await prisma.productLocation.count();
  console.log(`  After backfill:  ${afterBackfill} rows (inserted ${afterBackfill - before})`);

  // Activate ALL product-location pairs so seeded data is fully testable
  await prisma.productLocation.updateMany({
    data: { isActive: true },
  });

  const activeCount = await prisma.productLocation.count({ where: { isActive: true } });
  console.log(`  Activated: ${activeCount} product-location pairs`);

  // ------------------------------------------------------------------
  // Stage 4: Stock Balances — 10 units per product per location
  // Runs after activation: all product-location pairs are active.
  // ------------------------------------------------------------------
  console.log('');
  console.log('Seeding stock balances...');

  const INITIAL_QTY = 10;

  for (const product of allProducts) {
    for (const location of allLocations) {
      const existing = await prisma.stockBalance.findUnique({
        where: { productId_locationId: { productId: product.id, locationId: location.id } },
      });

      if (!existing) {
        await prisma.$transaction(async (tx) => {
          await (tx as any).stockBalance.create({
            data: {
              productId:   product.id,
              locationId:  location.id,
              onHandQty:   INITIAL_QTY,
              reservedQty: 0,
            },
          });

          await (tx as any).stockLedger.create({
            data: {
              productId:    product.id,
              locationId:   location.id,
              changeQty:    INITIAL_QTY,
              balanceAfter: INITIAL_QTY,
              sourceType:   LedgerSourceType.SEED,
              sourceId:     'seed',
            },
          });
        });

        console.log(`  StockBalance: ${product.sku} @ ${location.code} = ${INITIAL_QTY}`);
      } else {
        console.log(`  StockBalance (exists): ${product.sku} @ ${location.code} = ${Number(existing.onHandQty)}`);
      }
    }
  }

  // ------------------------------------------------------------------
  // Dashboard test data: adjustment & transfer requests
  // ------------------------------------------------------------------
  console.log('');
  console.log('Seeding dashboard test data...');

  const laptopId    = allProducts.find((p) => p.sku === 'ELEC-001')!.id;
  const operator1Id = userMap.get('operator1@example.com')!;
  const manager1Id  = userMap.get('manager1@example.com')!;
  const operator2Id = userMap.get('operator2@example.com')!;
  const wh1Id = locationMap.get('WH-001')!;
  const wh2Id = locationMap.get('WH-002')!;

  // ADJ-001 — SUBMITTED (needs manager approval at WH-001)
  if (!(await prisma.stockAdjustmentRequest.findUnique({ where: { requestNumber: 'ADJ-001' } }))) {
    await prisma.stockAdjustmentRequest.create({
      data: {
        requestNumber: 'ADJ-001',
        createdById:   operator1Id,
        status:        'SUBMITTED',
        createdAt:     daysAgo(1),
        items: {
          create: [{ productId: laptopId, locationId: wh1Id, qtyChange: 2 }],
        },
      },
    });
    console.log('  ADJ-001: SUBMITTED (awaiting manager approval)');
  } else {
    console.log('  ADJ-001: exists, skipped');
  }

  // ADJ-002 — APPROVED (ready for operator to finalize at WH-001)
  if (!(await prisma.stockAdjustmentRequest.findUnique({ where: { requestNumber: 'ADJ-002' } }))) {
    await prisma.stockAdjustmentRequest.create({
      data: {
        requestNumber: 'ADJ-002',
        createdById:   operator1Id,
        status:        'APPROVED',
        createdAt:     daysAgo(2),
        approvedById:  manager1Id,
        approvedAt:    daysAgo(0),
        items: {
          create: [{ productId: laptopId, locationId: wh1Id, qtyChange: 2 }],
        },
      },
    });
    console.log('  ADJ-002: APPROVED (ready to finalize)');
  } else {
    console.log('  ADJ-002: exists, skipped');
  }

  // TRF-001 — SUBMITTED (needs origin manager approval, WH-001 → WH-002)
  if (!(await prisma.stockTransferRequest.findUnique({ where: { requestNumber: 'TRF-001' } }))) {
    await prisma.stockTransferRequest.create({
      data: {
        requestNumber:        'TRF-001',
        createdById:          operator1Id,
        status:               'SUBMITTED',
        sourceLocationId:     wh1Id,
        destinationLocationId: wh2Id,
        createdAt:            daysAgo(3),
        items: {
          create: [{ productId: laptopId, qty: 2 }],
        },
      },
    });
    console.log('  TRF-001: SUBMITTED (awaiting origin approval)');
  } else {
    console.log('  TRF-001: exists, skipped');
  }

  // TRF-002 — ORIGIN_MANAGER_APPROVED (needs destination operator approval at WH-002)
  if (!(await prisma.stockTransferRequest.findUnique({ where: { requestNumber: 'TRF-002' } }))) {
    await prisma.stockTransferRequest.create({
      data: {
        requestNumber:        'TRF-002',
        createdById:          operator1Id,
        status:               'ORIGIN_MANAGER_APPROVED',
        sourceLocationId:     wh1Id,
        destinationLocationId: wh2Id,
        createdAt:            daysAgo(2),
        originApprovedById:   manager1Id,
        originApprovedAt:     daysAgo(2),
        items: {
          create: [{ productId: laptopId, qty: 2 }],
        },
      },
    });
    console.log('  TRF-002: ORIGIN_MANAGER_APPROVED (awaiting destination approval)');
  } else {
    console.log('  TRF-002: exists, skipped');
  }

  // TRF-003 — READY_TO_FINALIZE (both sides approved, WH-001 → WH-002)
  if (!(await prisma.stockTransferRequest.findUnique({ where: { requestNumber: 'TRF-003' } }))) {
    await prisma.stockTransferRequest.create({
      data: {
        requestNumber:           'TRF-003',
        createdById:             operator1Id,
        status:                  'READY_TO_FINALIZE',
        sourceLocationId:        wh1Id,
        destinationLocationId:   wh2Id,
        createdAt:               daysAgo(1),
        originApprovedById:      manager1Id,
        originApprovedAt:        daysAgo(1),
        destinationApprovedById: operator2Id,
        destinationApprovedAt:   daysAgo(0),
        items: {
          create: [{ productId: laptopId, qty: 2 }],
        },
      },
    });
    console.log('  TRF-003: READY_TO_FINALIZE');
  } else {
    console.log('  TRF-003: exists, skipped');
  }

  // TRF-004 — FINALIZED (stock & ledger updated, WH-001 → WH-002)
  if (!(await prisma.stockTransferRequest.findUnique({ where: { requestNumber: 'TRF-004' } }))) {
    await prisma.$transaction(async (tx) => {
      const trf = await tx.stockTransferRequest.create({
        data: {
          requestNumber:           'TRF-004',
          createdById:             operator1Id,
          status:                  'FINALIZED',
          sourceLocationId:        wh1Id,
          destinationLocationId:   wh2Id,
          createdAt:               daysAgo(0),
          originApprovedById:      manager1Id,
          originApprovedAt:        daysAgo(0),
          destinationApprovedById: operator2Id,
          destinationApprovedAt:   daysAgo(0),
          finalizedAt:             now,
          items: {
            create: [{ productId: laptopId, qty: 2 }],
          },
        },
      });

      await tx.stockBalance.updateMany({
        where: { productId: laptopId, locationId: wh1Id },
        data:  { onHandQty: { decrement: 2 } },
      });

      await tx.stockBalance.updateMany({
        where: { productId: laptopId, locationId: wh2Id },
        data:  { onHandQty: { increment: 2 } },
      });

      const balWh1 = await tx.stockBalance.findUnique({
        where: { productId_locationId: { productId: laptopId, locationId: wh1Id } },
      });
      const balWh2 = await tx.stockBalance.findUnique({
        where: { productId_locationId: { productId: laptopId, locationId: wh2Id } },
      });

      await tx.stockLedger.create({
        data: {
          productId:    laptopId,
          locationId:   wh1Id,
          changeQty:    -2,
          balanceAfter: balWh1!.onHandQty,
          sourceType:   LedgerSourceType.MOVEMENT_OUT,
          sourceId:     trf.id,
        },
      });

      await tx.stockLedger.create({
        data: {
          productId:    laptopId,
          locationId:   wh2Id,
          changeQty:    2,
          balanceAfter: balWh2!.onHandQty,
          sourceType:   LedgerSourceType.MOVEMENT_IN,
          sourceId:     trf.id,
        },
      });
    });
    console.log('  TRF-004: FINALIZED (stock updated, ledger written)');
  } else {
    console.log('  TRF-004: exists, skipped');
  }

  console.log('');
  console.log('Seeded dashboard test data:');
  console.log('- 2 adjustments (ADJ-001: SUBMITTED, ADJ-002: APPROVED)');
  console.log('- 4 transfers  (TRF-001: SUBMITTED, TRF-002: ORIGIN_MANAGER_APPROVED,');
  console.log('                TRF-003: READY_TO_FINALIZE, TRF-004: FINALIZED)');

  // ------------------------------------------------------------------
  // Verification
  // ------------------------------------------------------------------
  const productCount  = await prisma.product.count();
  const locationCount = await prisma.location.count();
  const matrixCount   = await prisma.productLocation.count();
  const activePairs   = await prisma.productLocation.count({ where: { isActive: true } });

  console.log('');
  console.log('Matrix verification:');
  console.log({
    productCount,
    locationCount,
    expectedMatrix: productCount * locationCount,
    actualMatrix:   matrixCount,
    activeCount:    activePairs,
  });

  if (matrixCount !== productCount * locationCount) {
    console.warn('  ⚠️  WARNING: actualMatrix !== expectedMatrix');
  } else {
    console.log('  ✓ Matrix complete');
  }
  if (activePairs === 0) {
    console.warn('  ⚠️  WARNING: no active product-location pairs');
  } else {
    console.log(`  ✓ ${activePairs} active pairs`);
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
  console.log('');
  console.log('  Dashboard test data (login as each user to verify):');
  console.log('    manager1  → Adjustments needsApproval:1  |  Transfers needsOriginApproval:1');
  console.log('    operator1 → Adjustments readyToFinalize:1');
  console.log('    operator2 → Transfers needsDestApproval:1  readyToFinalize:1  incoming:2');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
