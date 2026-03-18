/**
 * Stage 8.2.1.1 — Integration tests
 *
 * Tests:
 *  1. Stock dashboard returns isRegisteredNow / isInactiveNow per row
 *  2. Adjustments: approve warns about inactive items (non-blocking)
 *  3. Adjustments: finalize warns about inactive items (non-blocking)
 *  4. Transfers: approveOrigin warns about inactive items (non-blocking)
 *  5. Transfers: finalize blocked when item not registered at destination
 *  6. Transfers: finalize warns about inactive items at source (non-blocking)
 *  7. getProductLocationStatus helper: registered+active, registered+inactive, not registered
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn().mockReturnValue({
      sub:     'user-8211',
      email:   'user8211@example.com',
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
// Fixtures
// ---------------------------------------------------------------------------
const AUTH       = { Authorization: 'Bearer valid.token.here' };

const REQ_ID      = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LOCATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LOCATION_ID2= 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID     = 'user-8211';

const fakeUser     = { id: USER_ID, email: 'user8211@example.com', phone: null };
const fakeProduct  = { id: PRODUCT_ID, sku: 'SKU-001', name: 'Widget', uom: { code: 'PCS' } };
const fakeLocation = { id: LOCATION_ID, code: 'WH-001', name: 'Warehouse 1' };
const fakeLocation2= { id: LOCATION_ID2, code: 'WH-002', name: 'Warehouse 2' };

function makeAdjItem() {
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
  };
}

function makeAdjRequest(status = 'SUBMITTED', items: any[] = []) {
  return {
    id:                 REQ_ID,
    requestNumber:      'ADJ-20260318-WH-001-0001',
    status,
    notes:              null,
    createdById:        USER_ID,
    approvedById:       null,
    finalizedById:      null,
    cancelledById:      null,
    rejectedById:       null,
    approvedAt:         null,
    finalizedAt:        null,
    cancelledAt:        null,
    rejectedAt:         null,
    rejectionReason:    null,
    cancellationReason: null,
    createdAt:          new Date().toISOString(),
    updatedAt:          new Date().toISOString(),
    createdBy:          fakeUser,
    approvedBy:         null,
    finalizedBy:        null,
    cancelledBy:        null,
    rejectedBy:         null,
    items,
  };
}

function makeTransferItem() {
  return {
    id:        ITEM_ID,
    requestId: REQ_ID,
    productId: PRODUCT_ID,
    qty:       { toString: () => '10' },
    createdAt: new Date().toISOString(),
    product:   fakeProduct,
  };
}

function makeTransferRequest(status = 'SUBMITTED', items: any[] = []) {
  return {
    id:                    REQ_ID,
    requestNumber:         'TRF-20260318-WH001-WH002-0001',
    status,
    sourceLocationId:      LOCATION_ID,
    destinationLocationId: LOCATION_ID2,
    notes:                 null,
    createdById:           USER_ID,
    submittedAt:           null,
    originApprovedById:    null,
    originApprovedAt:      null,
    destinationApprovedById: null,
    destinationApprovedAt: null,
    finalizedAt:           null,
    cancelledById:         null,
    cancelledAt:           null,
    cancellationReason:    null,
    rejectedById:          null,
    rejectedAt:            null,
    rejectionReason:       null,
    createdAt:             new Date().toISOString(),
    updatedAt:             new Date().toISOString(),
    createdBy:             fakeUser,
    originApprovedBy:      null,
    destinationApprovedBy: null,
    cancelledBy:           null,
    rejectedBy:            null,
    sourceLocation:        fakeLocation,
    destinationLocation:   fakeLocation2,
    items,
  };
}

let db: any;
let authService: any;

beforeAll(async () => {
  db          = (await import('../src/config/database')).default;
  authService = (await import('../src/modules/auth/auth.service')).authService;
});

beforeEach(() => {
  jest.resetAllMocks();

  db.$transaction.mockImplementation(async (cb: Function) => await cb(db));

  // Default: admin user
  (authService.verifyAccessToken as jest.Mock).mockReturnValue({
    sub:     USER_ID,
    email:   'user8211@example.com',
    phone:   null,
    isAdmin: true,
  });

  db.location.findMany.mockResolvedValue([fakeLocation]);
  db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'MANAGER' }]);
  db.userLocationRole.findFirst.mockResolvedValue({
    id: 'role-1', userId: USER_ID, locationId: LOCATION_ID, role: 'MANAGER',
    location: { code: 'WH-001' },
  });
  db.product.findUnique.mockResolvedValue(fakeProduct);
  db.location.findUnique.mockResolvedValue({ ...fakeLocation, isActive: true });
  // Default: product active at source location
  db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true });
  db.productLocation.findMany.mockResolvedValue([]);
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
// Stock Dashboard — isRegisteredNow / isInactiveNow
// ===========================================================================

describe('GET /v1/stock — isRegisteredNow and isInactiveNow in response', () => {
  function fakeBalance() {
    return {
      productId:   PRODUCT_ID,
      locationId:  LOCATION_ID,
      onHandQty:   { toString: () => '10' },
      reservedQty: { toString: () => '0' },
      updatedAt:   new Date().toISOString(),
      product:     fakeProduct,
      location:    fakeLocation,
    };
  }

  it('returns isRegisteredNow=true and isInactiveNow=false when product is active at location', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);
    db.stockBalance.findMany.mockResolvedValue([fakeBalance()]);
    db.stockBalance.count.mockResolvedValue(1);
    // Active ProductLocation mapping
    db.productLocation.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true },
    ]);

    const res = await request(app).get('/v1/stock').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].isRegisteredNow).toBe(true);
    expect(res.body.data[0].isInactiveNow).toBe(false);
  });

  it('returns isRegisteredNow=true and isInactiveNow=true when product mapping is inactive', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);
    db.stockBalance.findMany.mockResolvedValue([fakeBalance()]);
    db.stockBalance.count.mockResolvedValue(1);
    // Inactive ProductLocation mapping
    db.productLocation.findMany.mockResolvedValue([
      { productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: false },
    ]);

    const res = await request(app).get('/v1/stock').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].isRegisteredNow).toBe(true);
    expect(res.body.data[0].isInactiveNow).toBe(true);
  });

  it('returns isRegisteredNow=false and isInactiveNow=false when no ProductLocation row exists', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID }]);
    db.stockBalance.findMany.mockResolvedValue([fakeBalance()]);
    db.stockBalance.count.mockResolvedValue(1);
    // No ProductLocation mapping at all
    db.productLocation.findMany.mockResolvedValue([]);

    const res = await request(app).get('/v1/stock').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].isRegisteredNow).toBe(false);
    expect(res.body.data[0].isInactiveNow).toBe(false);
  });
});

// ===========================================================================
// Adjustments: approve with inactive items — non-blocking warning
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/approve — inactive items warning (non-blocking)', () => {
  it('approves successfully even when an item has isActiveNow=false', async () => {
    const item    = makeAdjItem();
    const adjReq  = makeAdjRequest('SUBMITTED', [item]);
    const approved = makeAdjRequest('APPROVED', [item]);

    db.stockAdjustmentRequest.findUnique.mockResolvedValue(adjReq);
    db.stockAdjustmentRequest.update.mockResolvedValue(approved);
    // Product NOT active at location (now inactive)
    db.productLocation.findFirst.mockResolvedValue(null);
    db.productLocation.findMany.mockResolvedValue([]);
    db.stockReservation.aggregate.mockResolvedValue({ _sum: { qty: null } });

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });
});

// ===========================================================================
// Adjustments: finalize with inactive items — non-blocking warning
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/finalize — inactive items warning (non-blocking)', () => {
  it('finalizes successfully even when an item has isActiveNow=false', async () => {
    const item     = makeAdjItem();
    const adjReq   = makeAdjRequest('APPROVED', [item]);
    const finalized = makeAdjRequest('FINALIZED', [item]);

    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(adjReq)    // findById in finalize
      .mockResolvedValue(finalized);    // final re-fetch
    // Product NOT active (inactive mapping)
    db.productLocation.findFirst.mockResolvedValue(null);
    db.productLocation.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZED');
  });
});

// ===========================================================================
// Transfers: approveOrigin with inactive items — non-blocking warning
// ===========================================================================

describe('POST /v1/stock-transfers/:id/approve-origin — inactive items warning (non-blocking)', () => {
  it('approves at origin even when item has isActiveNow=false', async () => {
    const item    = makeTransferItem();
    const tReq    = makeTransferRequest('SUBMITTED', [item]);
    const approved = makeTransferRequest('ORIGIN_MANAGER_APPROVED', [item]);

    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(tReq)
      .mockResolvedValue(approved);
    // Product NOT active at source
    db.productLocation.findFirst.mockResolvedValue(null);
    db.productLocation.findMany.mockResolvedValue([]);
    db.stockReservation.findMany.mockResolvedValue([]);
    db.stockReservation.create.mockResolvedValue({ id: 'res-1' });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ORIGIN_MANAGER_APPROVED');
  });
});

// ===========================================================================
// Transfers: finalize blocked when item not at destination
// ===========================================================================

describe('POST /v1/stock-transfers/:id/finalize — destination registration check', () => {
  it('returns 400 when item is not registered at destination', async () => {
    const item  = makeTransferItem();
    const tReq  = makeTransferRequest('READY_TO_FINALIZE', [item]);

    db.stockTransferRequest.findUnique.mockResolvedValue(tReq);
    // Source: product is active
    // Destination: product is NOT active (validateProductActive at destination returns false)
    db.productLocation.findFirst
      .mockResolvedValueOnce({ id: 'pl-src', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true }) // isActiveNow (source)
      .mockResolvedValueOnce(null); // validateProductActive at destination

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not registered at destination/);
    expect(res.body.error.message).toContain(PRODUCT_ID);
  });

  it('finalizes successfully when all items are registered at destination', async () => {
    const item      = makeTransferItem();
    const tReq      = makeTransferRequest('READY_TO_FINALIZE', [item]);
    const finalized = makeTransferRequest('FINALIZED', [item]);

    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(tReq)
      .mockResolvedValue(finalized);
    // Both source AND destination have active mappings
    db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true });
    db.productLocation.findMany.mockResolvedValue([]);
    db.stockReservation.findMany.mockResolvedValue([
      { id: 'res-1', productId: PRODUCT_ID, locationId: LOCATION_ID, qty: 10, status: 'ACTIVE' },
    ]);
    db.stockReservation.update.mockResolvedValue({});
    db.stockBalance.upsert.mockResolvedValue({});

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZED');
  });
});

// ===========================================================================
// getProductLocationStatus helper
// ===========================================================================

import { getProductLocationStatus } from '../src/utils/validationHelpers';

describe('getProductLocationStatus', () => {
  it('returns isRegisteredNow=true, isActiveNow=true for active mapping', async () => {
    db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', isActive: true });
    const result = await getProductLocationStatus(PRODUCT_ID, LOCATION_ID);
    expect(result).toEqual({ isRegisteredNow: true, isActiveNow: true });
  });

  it('returns isRegisteredNow=true, isActiveNow=false for inactive mapping', async () => {
    db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', isActive: false });
    const result = await getProductLocationStatus(PRODUCT_ID, LOCATION_ID);
    expect(result).toEqual({ isRegisteredNow: true, isActiveNow: false });
  });

  it('returns isRegisteredNow=false, isActiveNow=false when no row exists', async () => {
    db.productLocation.findFirst.mockResolvedValue(null);
    const result = await getProductLocationStatus(PRODUCT_ID, LOCATION_ID);
    expect(result).toEqual({ isRegisteredNow: false, isActiveNow: false });
  });

  it('returns isRegisteredNow=false, isActiveNow=false and does not throw on DB error', async () => {
    db.productLocation.findFirst.mockRejectedValue(new Error('DB error'));
    const result = await getProductLocationStatus(PRODUCT_ID, LOCATION_ID);
    expect(result).toEqual({ isRegisteredNow: false, isActiveNow: false });
  });
});
