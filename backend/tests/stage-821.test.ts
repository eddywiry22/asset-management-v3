/**
 * Stage 8.2.1 — Integration tests
 *
 * Tests:
 *  1. GET /v1/stock/registered-products?locationId=<id>
 *  2. isActiveNow enrichment on adjustment findById (non-terminal vs terminal)
 *  3. isActiveNow enrichment on transfer findById (non-terminal vs terminal)
 *  4. Standardized error messages for blocked addItem
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn().mockReturnValue({
      sub:     'user-id-821',
      email:   'user821@example.com',
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
const ADMIN_AUTH = { Authorization: 'Bearer admin.token.here' };

const REQ_ID      = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LOCATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LOCATION_ID2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID     = 'user-id-821';

const fakeUser = { id: USER_ID, email: 'user821@example.com', phone: null };

const fakeProduct = { id: PRODUCT_ID, sku: 'SKU-001', name: 'Widget', uom: { code: 'PCS' } };
const fakeLocation = { id: LOCATION_ID, code: 'WH-001', name: 'Warehouse 1' };

function makeAdjItem(overrides: any = {}) {
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
    ...overrides,
  };
}

function makeAdjRequest(status = 'DRAFT', items: any[] = []) {
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

function makeTransferRequest(status = 'DRAFT', items: any[] = []) {
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
    destinationLocation:   { id: LOCATION_ID2, code: 'WH-002', name: 'Warehouse 2' },
    items,
  };
}

function makeTransferItem(overrides: any = {}) {
  return {
    id:        ITEM_ID,
    requestId: REQ_ID,
    productId: PRODUCT_ID,
    qty:       { toString: () => '10' },
    createdAt: new Date().toISOString(),
    product:   fakeProduct,
    ...overrides,
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

  // Default: non-admin user
  (authService.verifyAccessToken as jest.Mock).mockReturnValue({
    sub:     USER_ID,
    email:   'user821@example.com',
    phone:   null,
    isAdmin: false,
  });

  db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'OPERATOR' }]);
  db.userLocationRole.findFirst.mockResolvedValue({
    id: 'role-1', userId: USER_ID, locationId: LOCATION_ID, role: 'OPERATOR',
    location: { code: 'WH-001' },
  });
  db.product.findUnique.mockResolvedValue(fakeProduct);
  db.location.findUnique.mockResolvedValue({ ...fakeLocation, isActive: true });
  db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true });
  db.auditLog.create.mockResolvedValue({});
  db.stockReservation.aggregate.mockResolvedValue({ _sum: { qty: null } });
});

// ===========================================================================
// GET /v1/stock/registered-products
// ===========================================================================

describe('GET /v1/stock/registered-products', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/v1/stock/registered-products?locationId=' + LOCATION_ID);
    expect(res.status).toBe(401);
  });

  it('returns 400 when locationId is missing', async () => {
    const res = await request(app)
      .get('/v1/stock/registered-products')
      .set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns registered products for a location', async () => {
    const productList = [{ id: PRODUCT_ID, sku: 'SKU-001', name: 'Widget' }];
    db.productLocation.findMany.mockResolvedValue([
      { id: 'pl-1', product: productList[0] },
    ]);

    const res = await request(app)
      .get(`/v1/stock/registered-products?locationId=${LOCATION_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: PRODUCT_ID, sku: 'SKU-001' });
  });

  it('returns empty array when no products are registered', async () => {
    db.productLocation.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/v1/stock/registered-products?locationId=${LOCATION_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ===========================================================================
// isActiveNow — Adjustment findById
// ===========================================================================

describe('GET /v1/stock-adjustments/:id — isActiveNow enrichment', () => {
  it('includes isActiveNow=true on items for a non-terminal DRAFT request', async () => {
    const item = makeAdjItem();
    const req  = makeAdjRequest('DRAFT', [item]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(req);
    // Product is active at the location
    db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true });

    const res = await request(app)
      .get(`/v1/stock-adjustments/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBe(true);
  });

  it('includes isActiveNow=false on items when product mapping is inactive', async () => {
    const item = makeAdjItem();
    const req  = makeAdjRequest('SUBMITTED', [item]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(req);
    // Product is NOT active at the location
    db.productLocation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/v1/stock-adjustments/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBe(false);
  });

  it('does NOT include isActiveNow on items for a FINALIZED (terminal) request', async () => {
    const item = makeAdjItem();
    const req  = makeAdjRequest('FINALIZED', [item]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(req);

    const res = await request(app)
      .get(`/v1/stock-adjustments/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBeUndefined();
  });

  it('does NOT include isActiveNow on items for a CANCELLED (terminal) request', async () => {
    const item = makeAdjItem();
    const req  = makeAdjRequest('CANCELLED', [item]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(req);

    const res = await request(app)
      .get(`/v1/stock-adjustments/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBeUndefined();
  });
});

// ===========================================================================
// isActiveNow — Transfer findById
// ===========================================================================

describe('GET /v1/stock-transfers/:id — isActiveNow enrichment', () => {
  it('includes isActiveNow=true on items for a non-terminal DRAFT request', async () => {
    const item = makeTransferItem();
    const req  = makeTransferRequest('DRAFT', [item]);
    db.stockTransferRequest.findUnique.mockResolvedValue(req);
    db.productLocation.findFirst.mockResolvedValue({ id: 'pl-1', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true });

    const res = await request(app)
      .get(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBe(true);
  });

  it('includes isActiveNow=false on items when product mapping is inactive (SUBMITTED)', async () => {
    const item = makeTransferItem();
    const req  = makeTransferRequest('SUBMITTED', [item]);
    db.stockTransferRequest.findUnique.mockResolvedValue(req);
    // Simulate product deregistered after request was created
    db.productLocation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBe(false);
  });

  it('does NOT include isActiveNow on items for a FINALIZED (terminal) transfer', async () => {
    const item = makeTransferItem();
    const req  = makeTransferRequest('FINALIZED', [item]);
    db.stockTransferRequest.findUnique.mockResolvedValue(req);

    const res = await request(app)
      .get(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBeUndefined();
  });

  it('does NOT include isActiveNow for a REJECTED (terminal) transfer', async () => {
    const item = makeTransferItem();
    const req  = makeTransferRequest('REJECTED', [item]);
    db.stockTransferRequest.findUnique.mockResolvedValue(req);

    const res = await request(app)
      .get(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].isActiveNow).toBeUndefined();
  });
});

// ===========================================================================
// Standardized error messages — Stage 8.2.1
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/items — standardized error message', () => {
  it('returns 400 with standardized message when product is not registered at location', async () => {
    const req = makeAdjRequest('DRAFT', []);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(req);
    db.location.findUnique.mockResolvedValue({ ...fakeLocation, isActive: true });
    // Product NOT registered at location
    db.productLocation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Product is not registered or not active at this location/);
    expect(res.body.error.message).toContain(PRODUCT_ID);
  });
});

describe('POST /v1/stock-transfers/:id/items — standardized error message', () => {
  it('returns 400 with standardized message when product is not registered at source location', async () => {
    const tReq = makeTransferRequest('DRAFT', []);
    db.stockTransferRequest.findUnique.mockResolvedValue(tReq);
    // Product NOT registered at source location
    db.productLocation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Product is not registered or not active at source location/);
    expect(res.body.error.message).toContain(PRODUCT_ID);
  });
});
