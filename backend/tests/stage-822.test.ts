/**
 * Stage 8.2.2 — Integration & unit tests
 *
 * Coverage:
 *  1. Stock Dashboard — Active badge: isRegisteredNow=true, isInactiveNow=false → active row
 *  2. Adjustment finalize blocked (400) when any item has isActiveNow=false
 *  3. Adjustment finalize succeeds (200) when all items are active
 *  4. Product Registration: GET /:id/check-deactivate — no pending requests → canDeactivate=true
 *  5. Product Registration: GET /:id/check-deactivate — pending adjustments → canDeactivate=false
 *  6. Product Registration: GET /:id/check-deactivate — pending transfers → canDeactivate=false
 *  7. Product Registration: PUT /:id with isActive=false blocked (400) when pending requests exist
 *  8. Product Registration: PUT /:id with isActive=false succeeds (200) when no pending requests
 *  9. Product Registration: PUT /:id with isActive=false succeeds (200) when already inactive (no re-check)
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn().mockReturnValue({
      sub:     'user-822',
      email:   'user822@example.com',
      phone:   null,
      isAdmin: true,
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
    updateMany: jest.fn(),
    delete:     jest.fn(),
    deleteMany: jest.fn(),
    count:      jest.fn(),
    groupBy:    jest.fn(),
    upsert:     jest.fn(),
    aggregate:  jest.fn(),
  });

  return {
    __esModule: true,
    default: {
      stockAdjustmentRequest: createMock(),
      stockAdjustmentItem:    createMock(),
      stockTransferRequest:   createMock(),
      stockTransferItem:      createMock(),
      stockBalance:           createMock(),
      stockLedger:            createMock(),
      stockReservation:       createMock(),
      product:                createMock(),
      location:               createMock(),
      productLocation:        createMock(),
      userLocationRole:       createMock(),
      auditLog:               { create: jest.fn().mockResolvedValue({}) },
      $connect:    jest.fn(),
      $disconnect: jest.fn(),
      $transaction: jest.fn(),
      $queryRaw:   jest.fn(),
    },
    connectDatabase:    jest.fn(),
    disconnectDatabase: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AUTH        = { Authorization: 'Bearer valid.token.here' };
const REQ_ID      = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LOCATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LOCATION_ID2= 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REG_ID      = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const USER_ID     = 'user-822';

const fakeProduct   = { id: PRODUCT_ID, sku: 'SKU-001', name: 'Widget', uom: { code: 'PCS' } };
const fakeLocation  = { id: LOCATION_ID,  code: 'WH-001', name: 'Warehouse 1' };
const fakeLocation2 = { id: LOCATION_ID2, code: 'WH-002', name: 'Warehouse 2' };

function makeAdjItem(overrides: Record<string, any> = {}) {
  return {
    id:         ITEM_ID,
    requestId:  REQ_ID,
    productId:  PRODUCT_ID,
    locationId: LOCATION_ID,
    qtyChange:  { toString: () => '5' },
    reason:     null,
    createdAt:  new Date().toISOString(),
    product:    fakeProduct,
    location:   fakeLocation,
    isActiveNow: true,
    ...overrides,
  };
}

function makeAdjRequest(status = 'APPROVED', items: any[] = []) {
  return {
    id:                 REQ_ID,
    requestNumber:      'ADJ-20260318-WH-001-0001',
    status,
    notes:              null,
    createdById:        USER_ID,
    approvedById:       USER_ID,
    finalizedById:      null,
    cancelledById:      null,
    rejectedById:       null,
    approvedAt:         new Date().toISOString(),
    finalizedAt:        null,
    cancelledAt:        null,
    rejectedAt:         null,
    rejectionReason:    null,
    cancellationReason: null,
    createdAt:          new Date().toISOString(),
    updatedAt:          new Date().toISOString(),
    createdBy:          { id: USER_ID, email: 'user822@example.com', phone: null },
    approvedBy:         null,
    finalizedBy:        null,
    cancelledBy:        null,
    rejectedBy:         null,
    items,
  };
}

function fakeRegistration(isActive = true) {
  return {
    id:         REG_ID,
    productId:  PRODUCT_ID,
    locationId: LOCATION_ID,
    isActive,
    createdAt:  new Date(),
    updatedAt:  new Date(),
    product:    { id: PRODUCT_ID, sku: 'SKU-001', name: 'Widget' },
    location:   { id: LOCATION_ID, code: 'WH-001', name: 'Warehouse 1' },
  };
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
let db: any;
let authService: any;

beforeAll(async () => {
  db          = (await import('../src/config/database')).default;
  authService = (await import('../src/modules/auth/auth.service')).authService;
});

beforeEach(() => {
  jest.resetAllMocks();

  db.$transaction.mockImplementation(async (cb: Function) => await cb(db));

  (authService.verifyAccessToken as jest.Mock).mockReturnValue({
    sub: USER_ID, email: 'user822@example.com', phone: null, isAdmin: true,
  });

  db.location.findMany.mockResolvedValue([fakeLocation]);
  db.location.findUnique.mockResolvedValue({ ...fakeLocation, isActive: true });
  db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'MANAGER' }]);
  db.userLocationRole.findFirst.mockResolvedValue({
    id: 'role-1', userId: USER_ID, locationId: LOCATION_ID, role: 'MANAGER',
    location: { code: 'WH-001' },
  });
  db.product.findUnique.mockResolvedValue(fakeProduct);
  db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true });
  db.productLocation.findMany.mockResolvedValue([{ productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true }]);
  db.auditLog.create.mockResolvedValue({});
  db.stockReservation.aggregate.mockResolvedValue({ _sum: { qty: null } });
  db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
  db.stockBalance.findUnique.mockResolvedValue({ onHandQty: '100', reservedQty: '0' });
  db.stockBalance.upsert.mockResolvedValue({});
  db.stockBalance.update.mockResolvedValue({});
  db.stockLedger.create.mockResolvedValue({});
  db.stockReservation.findMany.mockResolvedValue([]);
  db.stockReservation.update.mockResolvedValue({});
  db.stockAdjustmentRequest.updateMany.mockResolvedValue({ count: 1 });
  db.stockTransferRequest.updateMany.mockResolvedValue({ count: 1 });
});

// ===========================================================================
// 1. Stock Dashboard — Active badge (isRegisteredNow=true, isInactiveNow=false)
// ===========================================================================

describe('GET /v1/stock — Active badge for registered+active products', () => {
  function fakeBalance() {
    return {
      productId:   PRODUCT_ID,
      locationId:  LOCATION_ID,
      onHandQty:   { toString: () => '50' },
      reservedQty: { toString: () => '0' },
      updatedAt:   new Date().toISOString(),
      product:     fakeProduct,
      location:    fakeLocation,
    };
  }

  it('returns isRegisteredNow=true and isInactiveNow=false for an active registration', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);
    db.stockBalance.findMany.mockResolvedValue([fakeBalance()]);
    db.stockBalance.count.mockResolvedValue(1);
    db.productLocation.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true },
    ]);

    const res = await request(app).get('/v1/stock').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].isRegisteredNow).toBe(true);
    expect(res.body.data[0].isInactiveNow).toBe(false);
  });

  it('returns isRegisteredNow=true and isInactiveNow=true for an inactive registration', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);
    db.stockBalance.findMany.mockResolvedValue([fakeBalance()]);
    db.stockBalance.count.mockResolvedValue(1);
    db.productLocation.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: false },
    ]);

    const res = await request(app).get('/v1/stock').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].isRegisteredNow).toBe(true);
    expect(res.body.data[0].isInactiveNow).toBe(true);
  });

  it('returns isRegisteredNow=false and isInactiveNow=false when no mapping exists', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);
    db.stockBalance.findMany.mockResolvedValue([fakeBalance()]);
    db.stockBalance.count.mockResolvedValue(1);
    db.productLocation.findMany.mockResolvedValue([]);

    const res = await request(app).get('/v1/stock').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].isRegisteredNow).toBe(false);
    expect(res.body.data[0].isInactiveNow).toBe(false);
  });
});

// ===========================================================================
// 2. Adjustment finalize — BLOCKED when items have isActiveNow=false
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/finalize — blocked when items inactive', () => {
  it('returns 400 when an item has isActiveNow=false', async () => {
    const inactiveItem = makeAdjItem({ isActiveNow: false });
    const adjReq = makeAdjRequest('APPROVED', [inactiveItem]);

    db.stockAdjustmentRequest.findUnique.mockResolvedValue(adjReq);
    // validateProductActive queries `where: { isActive: true }` — returning null means
    // no active mapping found → isActiveNow=false
    db.productLocation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/inactive/i);
  });

  it('returns 200 when all items are active', async () => {
    const activeItem = makeAdjItem({ isActiveNow: true });
    const adjReq  = makeAdjRequest('APPROVED', [activeItem]);
    const finalized = makeAdjRequest('FINALIZED', [activeItem]);

    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(adjReq)   // findById inside finalize
      .mockResolvedValueOnce(finalized); // findById at the end

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 3. Product Registration — GET /:id/check-deactivate
// ===========================================================================

describe('GET /v1/admin/product-registrations/:id/check-deactivate', () => {
  it('returns canDeactivate=true when no pending requests exist', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeRegistration(true));
    db.productLocation.findFirst.mockResolvedValue(fakeRegistration(true));
    db.stockAdjustmentRequest.count.mockResolvedValue(0);
    db.stockTransferRequest.count.mockResolvedValue(0);

    const res = await request(app)
      .get(`/v1/admin/product-registrations/${REG_ID}/check-deactivate`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.canDeactivate).toBe(true);
    expect(res.body.data.pendingCount).toBe(0);
  });

  it('returns canDeactivate=false when pending adjustment requests exist', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeRegistration(true));
    db.productLocation.findFirst.mockResolvedValue(fakeRegistration(true));
    db.stockAdjustmentRequest.count.mockResolvedValue(2);
    db.stockTransferRequest.count.mockResolvedValue(0);

    const res = await request(app)
      .get(`/v1/admin/product-registrations/${REG_ID}/check-deactivate`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.canDeactivate).toBe(false);
    expect(res.body.data.adjustments).toBe(2);
    expect(res.body.data.transfers).toBe(0);
    expect(res.body.data.pendingCount).toBe(2);
  });

  it('returns canDeactivate=false when pending transfer requests exist', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeRegistration(true));
    db.productLocation.findFirst.mockResolvedValue(fakeRegistration(true));
    db.stockAdjustmentRequest.count.mockResolvedValue(0);
    db.stockTransferRequest.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/v1/admin/product-registrations/${REG_ID}/check-deactivate`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.canDeactivate).toBe(false);
    expect(res.body.data.transfers).toBe(1);
    expect(res.body.data.pendingCount).toBe(1);
  });
});

// ===========================================================================
// 4. Product Registration — PUT /:id toggle-to-inactive blocked by pending
// ===========================================================================

describe('PUT /v1/admin/product-registrations/:id — deactivation guard', () => {
  it('returns 400 when pending requests exist and isActive set to false', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeRegistration(true));
    db.productLocation.findFirst.mockResolvedValue(fakeRegistration(true));
    db.stockAdjustmentRequest.count.mockResolvedValue(1);
    db.stockTransferRequest.count.mockResolvedValue(0);

    const res = await request(app)
      .put(`/v1/admin/product-registrations/${REG_ID}`)
      .set(AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/pending requests/i);
  });

  it('returns 200 when no pending requests — deactivation allowed', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeRegistration(true));
    db.productLocation.findFirst.mockResolvedValue(fakeRegistration(true));
    db.stockAdjustmentRequest.count.mockResolvedValue(0);
    db.stockTransferRequest.count.mockResolvedValue(0);
    db.productLocation.update.mockResolvedValue(fakeRegistration(false));

    const res = await request(app)
      .put(`/v1/admin/product-registrations/${REG_ID}`)
      .set(AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('returns 200 without pending check when registration is already inactive', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeRegistration(false));
    db.productLocation.findFirst.mockResolvedValue(fakeRegistration(false));
    db.productLocation.update.mockResolvedValue(fakeRegistration(false));

    const res = await request(app)
      .put(`/v1/admin/product-registrations/${REG_ID}`)
      .set(AUTH)
      .send({ isActive: false });

    // No pending check needed — already inactive
    expect(db.stockAdjustmentRequest.count).not.toHaveBeenCalled();
    expect(db.stockTransferRequest.count).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('returns 200 when activating a registration (no pending check needed)', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeRegistration(false));
    db.productLocation.findFirst.mockResolvedValue(fakeRegistration(false));
    db.productLocation.update.mockResolvedValue(fakeRegistration(true));

    const res = await request(app)
      .put(`/v1/admin/product-registrations/${REG_ID}`)
      .set(AUTH)
      .send({ isActive: true });

    expect(db.stockAdjustmentRequest.count).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });
});
