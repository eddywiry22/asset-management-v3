/**
 * Stock Module Tests — Stage 4
 *
 * Tests run against a mocked Prisma client (no live database required).
 * Covers: GET /v1/stock, GET /v1/stock/ledger, GET /v1/stock/locations
 * Enforces: auth, role visibility, pagination, period filters,
 *           ledger location security, reservation underflow protection.
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT — token is verified in auth middleware
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn().mockReturnValue({
      sub:     'user-manager-id',
      email:   'manager1@example.com',
      phone:   null,
      isAdmin: false,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
jest.mock('../src/config/database', () => {
  const createMock = () => ({
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    count:      jest.fn(),
    groupBy:    jest.fn(),
    upsert:     jest.fn(),
  });

  return {
    __esModule: true,
    default: {
      stockBalance:    createMock(),
      stockLedger:     createMock(),
      product:         createMock(),
      location:        createMock(),
      userLocationRole: createMock(),
      auditLog:        { create: jest.fn().mockResolvedValue({}) },
      $connect:     jest.fn(),
      $disconnect:  jest.fn(),
      $transaction: jest.fn(),
      // Used by lockBalanceRow (SELECT FOR UPDATE inside transactions)
      $queryRaw:    jest.fn(),
    },
    connectDatabase:    jest.fn(),
    disconnectDatabase: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers / Fixtures
// ---------------------------------------------------------------------------
const AUTH       = { Authorization: 'Bearer valid.token.here' };
const ADMIN_AUTH = { Authorization: 'Bearer admin.token.here' };

const PRODUCT_ID  = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const LOCATION_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const fakeBalance = {
  id:          'cccccccc-cccc-4ccc-cccc-cccccccccccc',
  productId:   PRODUCT_ID,
  locationId:  LOCATION_ID,
  onHandQty:   { toString: () => '10' },
  reservedQty: { toString: () => '0' },
  updatedAt:   new Date().toISOString(),
  product:  { id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop', uom: { code: 'PCS' } },
  location: { id: LOCATION_ID, code: 'WH-001', name: 'Main Warehouse' },
};

const fakeLedgerEntry = {
  id:          'dddddddd-dddd-4ddd-dddd-dddddddddddd',
  productId:   PRODUCT_ID,
  locationId:  LOCATION_ID,
  changeQty:   { toString: () => '10' },
  balanceAfter: { toString: () => '10' },
  sourceType:  'SEED',
  sourceId:    'seed',
  createdAt:   new Date().toISOString(),
  product:  { id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop' },
  location: { id: LOCATION_ID, code: 'WH-001', name: 'Main Warehouse' },
};

let db: any;
let authService: any;

beforeAll(async () => {
  db          = (await import('../src/config/database')).default;
  authService = (await import('../src/modules/auth/auth.service')).authService;
});

const LOCATION_ID_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
  jest.clearAllMocks();
  // Default: manager user with role at LOCATION_ID
  (authService.verifyAccessToken as jest.Mock).mockReturnValue({
    sub:     'user-manager-id',
    email:   'manager1@example.com',
    phone:   null,
    isAdmin: false,
  });
  db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);

  // Default: lockBalanceRow returns rows with sufficient stock
  db.$queryRaw.mockResolvedValue([{ onHandQty: '10', reservedQty: '0' }]);
});

// ===========================================================================
// AUTH ENFORCEMENT
// ===========================================================================

describe('Auth enforcement on stock routes', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/v1/stock');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 without token on ledger', async () => {
    const res = await request(app).get('/v1/stock/ledger');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// GET /v1/stock
// ===========================================================================

describe('GET /v1/stock', () => {
  it('returns paginated stock balances for manager', async () => {
    db.stockBalance.findMany.mockResolvedValue([fakeBalance]);
    db.stockBalance.count.mockResolvedValue(1);
    db.stockLedger.groupBy.mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/stock')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productSku).toBe('ELEC-001');
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('returns empty array when user has no location roles', async () => {
    db.userLocationRole.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/stock')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });

  it('respects pagination query params', async () => {
    db.stockBalance.findMany.mockResolvedValue([fakeBalance]);
    db.stockBalance.count.mockResolvedValue(50);
    db.stockLedger.groupBy.mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/stock?page=2&limit=5')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.limit).toBe(5);
    expect(res.body.meta.total).toBe(50);
  });

  it('admin can see all locations without role assignment', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub:     'user-admin-id',
      email:   'admin@example.com',
      phone:   null,
      isAdmin: true,
    });

    db.location.findMany.mockResolvedValue([
      { id: LOCATION_ID },
      { id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee' },
    ]);
    db.stockBalance.findMany.mockResolvedValue([fakeBalance]);
    db.stockBalance.count.mockResolvedValue(1);
    db.stockLedger.groupBy.mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/stock')
      .set(ADMIN_AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 403 when non-admin requests a location they are not assigned to', async () => {
    // Use a valid UUID v4 (variant nibble must be 8, 9, a, or b)
    const otherLocationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    // user has role only at LOCATION_ID, not otherLocationId
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);

    const res = await request(app)
      .get(`/v1/stock?locationId=${otherLocationId}`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid locationId (not uuid)', async () => {
    const res = await request(app)
      .get('/v1/stock?locationId=not-a-uuid')
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('includes period computed columns when startDate and endDate provided', async () => {
    db.stockBalance.findMany.mockResolvedValue([fakeBalance]);
    db.stockBalance.count.mockResolvedValue(1);
    db.stockLedger.groupBy.mockResolvedValue([
      {
        productId: PRODUCT_ID,
        locationId: LOCATION_ID,
        sourceType: 'SEED',
        _sum: { changeQty: 10 },
      },
    ]);
    db.stockLedger.findFirst.mockResolvedValue(null); // no balance before start

    const start = new Date('2024-01-01T00:00:00.000Z').toISOString();
    const end   = new Date('2024-12-31T23:59:59.999Z').toISOString();

    const res = await request(app)
      .get(`/v1/stock?startDate=${start}&endDate=${end}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty('startingQty');
    expect(res.body.data[0]).toHaveProperty('inboundQty');
    expect(res.body.data[0]).toHaveProperty('outboundQty');
    expect(res.body.data[0]).toHaveProperty('finalQty');
  });
});

// ===========================================================================
// GET /v1/stock/ledger
// ===========================================================================

describe('GET /v1/stock/ledger', () => {
  it('returns paginated ledger entries', async () => {
    db.stockLedger.findMany.mockResolvedValue([fakeLedgerEntry]);
    db.stockLedger.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/v1/stock/ledger?locationId=${LOCATION_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sourceType).toBe('SEED');
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('returns empty when user has no location roles', async () => {
    db.userLocationRole.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/v1/stock/ledger')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('supports productId filter', async () => {
    db.stockLedger.findMany.mockResolvedValue([fakeLedgerEntry]);
    db.stockLedger.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/v1/stock/ledger?productId=${PRODUCT_ID}&locationId=${LOCATION_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].productId).toBe(PRODUCT_ID);
  });

  it('returns 403 when non-admin requests ledger for unauthorized location', async () => {
    // Valid UUID v4 (variant nibble = 8)
    const otherLocationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);

    const res = await request(app)
      .get(`/v1/stock/ledger?locationId=${otherLocationId}`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('supports period filters', async () => {
    db.stockLedger.findMany.mockResolvedValue([fakeLedgerEntry]);
    db.stockLedger.count.mockResolvedValue(1);

    const start = '2024-01-01T00:00:00.000Z';
    const end   = '2024-12-31T23:59:59.999Z';

    const res = await request(app)
      .get(`/v1/stock/ledger?locationId=${LOCATION_ID}&startDate=${start}&endDate=${end}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 400 for invalid uuid productId', async () => {
    const res = await request(app)
      .get('/v1/stock/ledger?productId=not-a-uuid')
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('supports pagination on ledger', async () => {
    db.stockLedger.findMany.mockResolvedValue([fakeLedgerEntry]);
    db.stockLedger.count.mockResolvedValue(100);

    const res = await request(app)
      .get(`/v1/stock/ledger?locationId=${LOCATION_ID}&page=3&limit=10`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(3);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.total).toBe(100);
  });
});

// ===========================================================================
// STOCK SERVICE — reservation enforcement
// ===========================================================================

describe('Stock reservation enforcement', () => {
  it('validates that reservedQty cannot exceed onHandQty via service', async () => {
    const { stockService } = await import('../src/modules/stock/stock.service');

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({
      id: 'id', productId: PRODUCT_ID, locationId: LOCATION_ID,
      onHandQty: '5', reservedQty: '3',
    });
    // lockBalanceRow returns onHand=5, reserved=3 → available=2; requesting 10 → fail
    db.$queryRaw.mockResolvedValue([{ onHandQty: '5', reservedQty: '3' }]);

    await expect(
      stockService.reserveStock({ productId: PRODUCT_ID, locationId: LOCATION_ID, qty: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('validates that adjustment cannot reduce stock below available qty', async () => {
    const { stockService } = await import('../src/modules/stock/stock.service');

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({
      id: 'id', productId: PRODUCT_ID, locationId: LOCATION_ID,
      onHandQty: '5', reservedQty: '3',
    });
    // lockBalanceRow: onHand=5, reserved=3 → available=2; change=-5 → would go negative
    db.$queryRaw.mockResolvedValue([{ onHandQty: '5', reservedQty: '3' }]);

    await expect(
      stockService.applyAdjustment({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: -5, sourceId: 'test' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ===========================================================================
// LEDGER LOCATION SECURITY — multi-location non-admin user
// ===========================================================================

describe('GET /v1/stock/ledger — location security for multi-role users', () => {
  it('restricts ledger results to the user\'s assigned locations when no locationId is specified', async () => {
    // User has roles at TWO locations
    db.userLocationRole.findMany.mockResolvedValue([
      { locationId: LOCATION_ID },
      { locationId: LOCATION_ID_2 },
    ]);
    db.stockLedger.findMany.mockResolvedValue([fakeLedgerEntry]);
    db.stockLedger.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/stock/ledger')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // The repository must have been called with a WHERE IN clause over both locations
    const findManyCall = db.stockLedger.findMany.mock.calls[0][0];
    expect(findManyCall.where.locationId).toEqual({ in: [LOCATION_ID, LOCATION_ID_2] });
  });

  it('returns only the requested location when locationId is explicitly specified', async () => {
    db.userLocationRole.findMany.mockResolvedValue([
      { locationId: LOCATION_ID },
      { locationId: LOCATION_ID_2 },
    ]);
    db.stockLedger.findMany.mockResolvedValue([fakeLedgerEntry]);
    db.stockLedger.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/v1/stock/ledger?locationId=${LOCATION_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    // The repository must have been called with a single locationId, not an IN clause
    const findManyCall = db.stockLedger.findMany.mock.calls[0][0];
    expect(findManyCall.where.locationId).toBe(LOCATION_ID);
  });
});

// ===========================================================================
// RESERVATION UNDERFLOW PROTECTION
// ===========================================================================

describe('releaseReservation underflow protection', () => {
  it('returns 400 when release qty exceeds currently reserved qty', async () => {
    const { stockService } = await import('../src/modules/stock/stock.service');

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    // Only 2 units are reserved; trying to release 10 must fail
    db.stockBalance.findUnique.mockResolvedValue({
      id: 'id', productId: PRODUCT_ID, locationId: LOCATION_ID,
      onHandQty: '10', reservedQty: '2',
    });

    await expect(
      stockService.releaseReservation({ productId: PRODUCT_ID, locationId: LOCATION_ID, qty: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('succeeds when release qty is within reserved qty', async () => {
    const { stockService } = await import('../src/modules/stock/stock.service');

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.findUnique.mockResolvedValue({
      id: 'id', productId: PRODUCT_ID, locationId: LOCATION_ID,
      onHandQty: '10', reservedQty: '5',
    });
    db.stockBalance.update.mockResolvedValue({
      id: 'id', productId: PRODUCT_ID, locationId: LOCATION_ID,
      onHandQty: '10', reservedQty: '3',
      product: { id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop', uom: { code: 'PCS' } },
      location: { id: LOCATION_ID, code: 'WH-001', name: 'Main Warehouse' },
    });

    await expect(
      stockService.releaseReservation({ productId: PRODUCT_ID, locationId: LOCATION_ID, qty: 2 })
    ).resolves.toBeUndefined();
  });
});
