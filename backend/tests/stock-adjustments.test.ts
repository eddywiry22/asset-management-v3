/**
 * Stock Adjustment Requests — Stage 5 Tests
 *
 * Covers: full workflow (create → add items → submit → approve → finalize),
 * critical business rules, and edge cases.
 * Uses mocked Prisma and JWT (no live database required).
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn().mockReturnValue({
      sub:     'user-manager-id',
      email:   'manager@example.com',
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
    delete:     jest.fn(),
    count:      jest.fn(),
    groupBy:    jest.fn(),
    upsert:     jest.fn(),
  });

  return {
    __esModule: true,
    default: {
      stockAdjustmentRequest: createMock(),
      stockAdjustmentItem:    createMock(),
      stockBalance:           createMock(),
      stockLedger:            createMock(),
      product:                createMock(),
      location:               createMock(),
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
const USER_ID     = 'user-manager-id';

const fakeUser = { id: USER_ID, email: 'manager@example.com', phone: null };

const fakeItem = {
  id:         ITEM_ID,
  requestId:  REQ_ID,
  productId:  PRODUCT_ID,
  locationId: LOCATION_ID,
  qtyChange:  { toString: () => '5' },
  reason:     'recount',
  createdAt:  new Date().toISOString(),
  product:  { id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop', uom: { code: 'PCS' } },
  location: { id: LOCATION_ID, code: 'WH-001', name: 'Main Warehouse' },
};

function makeFakeRequest(status = 'DRAFT', items: any[] = []) {
  return {
    id:            REQ_ID,
    requestNumber: 'ADJ-20260310-0001',
    status,
    notes:         null,
    createdById:   USER_ID,
    approvedById:  null,
    finalizedById: null,
    approvedAt:    null,
    finalizedAt:   null,
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
    createdBy:     fakeUser,
    approvedBy:    null,
    finalizedBy:   null,
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
  jest.clearAllMocks();
  // Default: manager user
  (authService.verifyAccessToken as jest.Mock).mockReturnValue({
    sub:     USER_ID,
    email:   'manager@example.com',
    phone:   null,
    isAdmin: false,
  });
  // User has MANAGER role
  db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'MANAGER' }]);
  // applyAdjustment internals
  db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
  db.stockBalance.upsert.mockResolvedValue({ id: 'bal', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '100', reservedQty: '0' });
  db.stockBalance.update.mockResolvedValue({ id: 'bal', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '105', reservedQty: '0' });
  db.stockLedger.create.mockResolvedValue({});
});

// ===========================================================================
// AUTH ENFORCEMENT
// ===========================================================================

describe('Auth enforcement on stock-adjustments routes', () => {
  it('returns 401 without token on GET /v1/stock-adjustments', async () => {
    const res = await request(app).get('/v1/stock-adjustments');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 without token on POST /v1/stock-adjustments', async () => {
    const res = await request(app).post('/v1/stock-adjustments').send({});
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// CREATE REQUEST
// ===========================================================================

describe('POST /v1/stock-adjustments — create request', () => {
  it('creates a new DRAFT request', async () => {
    const fake = makeFakeRequest('DRAFT');
    db.stockAdjustmentRequest.count.mockResolvedValue(0);
    db.stockAdjustmentRequest.create.mockResolvedValue(fake);

    const res = await request(app)
      .post('/v1/stock-adjustments')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.requestNumber).toMatch(/^ADJ-\d{8}-\d{4}$/);
  });

  it('creates request with notes', async () => {
    const fake = makeFakeRequest('DRAFT');
    fake.notes = 'Quarterly recount' as any;
    db.stockAdjustmentRequest.count.mockResolvedValue(0);
    db.stockAdjustmentRequest.create.mockResolvedValue(fake);

    const res = await request(app)
      .post('/v1/stock-adjustments')
      .set(AUTH)
      .send({ notes: 'Quarterly recount' });

    expect(res.status).toBe(201);
    expect(res.body.data.notes).toBe('Quarterly recount');
  });

  it('generates requestNumber with ADJ-YYYYMMDD-XXXX format', async () => {
    db.stockAdjustmentRequest.count.mockResolvedValue(3); // 4th request of the day
    db.stockAdjustmentRequest.create.mockImplementation((args: any) => Promise.resolve({
      ...makeFakeRequest('DRAFT'),
      requestNumber: args.data.requestNumber,
    }));

    const res = await request(app)
      .post('/v1/stock-adjustments')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data.requestNumber).toMatch(/^ADJ-\d{8}-0004$/);
  });
});

// ===========================================================================
// GET LIST
// ===========================================================================

describe('GET /v1/stock-adjustments — list', () => {
  it('returns paginated list', async () => {
    db.stockAdjustmentRequest.findMany.mockResolvedValue([makeFakeRequest()]);
    db.stockAdjustmentRequest.count.mockResolvedValue(1);

    const res = await request(app).get('/v1/stock-adjustments').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('filters by status', async () => {
    db.stockAdjustmentRequest.findMany.mockResolvedValue([makeFakeRequest('SUBMITTED')]);
    db.stockAdjustmentRequest.count.mockResolvedValue(1);

    const res = await request(app).get('/v1/stock-adjustments?status=SUBMITTED').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('SUBMITTED');
    const findArgs = db.stockAdjustmentRequest.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toBe('SUBMITTED');
  });
});

// ===========================================================================
// GET BY ID
// ===========================================================================

describe('GET /v1/stock-adjustments/:id', () => {
  it('returns a request with items', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));

    const res = await request(app).get(`/v1/stock-adjustments/${REQ_ID}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(REQ_ID);
    expect(res.body.data.items).toHaveLength(1);
  });

  it('returns 404 for unknown id', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(null);

    const res = await request(app).get(`/v1/stock-adjustments/${REQ_ID}`).set(AUTH);

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// ADD ITEM
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/items — add item', () => {
  it('adds an item to a DRAFT request', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT'));
    db.stockAdjustmentItem.create.mockResolvedValue(fakeItem);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: 5, reason: 'recount' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.productId).toBe(PRODUCT_ID);
  });

  it('returns 400 for invalid payload (missing required fields)', async () => {
    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID }); // missing locationId and qtyChange

    expect(res.status).toBe(400);
  });

  it('returns 400 for qtyChange = 0', async () => {
    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: 0 });

    expect(res.status).toBe(400);
  });

  it('cannot add items when request is not DRAFT', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED'));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });
});

// ===========================================================================
// SUBMIT REQUEST
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/submit', () => {
  it('submits a DRAFT request with items', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockAdjustmentRequest.update.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('returns 400 when submitting a request with no items', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', []));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/at least one item/);
  });

  it('returns 400 when submitting a non-DRAFT request', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// APPROVE REQUEST
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/approve', () => {
  it('approves a SUBMITTED request as manager', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    const approved = makeFakeRequest('APPROVED', [fakeItem]);
    approved.approvedById = USER_ID as any;
    approved.approvedAt   = new Date().toISOString() as any;
    db.stockAdjustmentRequest.update.mockResolvedValue(approved);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('returns 403 when operator tries to approve', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'OPERATOR' }]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(AUTH);

    expect(res.status).toBe(403);
  });

  it('admin can approve without location role', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub:     USER_ID,
      email:   'admin@example.com',
      phone:   null,
      isAdmin: true,
    });
    db.userLocationRole.findMany.mockResolvedValue([]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    db.stockAdjustmentRequest.update.mockResolvedValue(makeFakeRequest('APPROVED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(ADMIN_AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('returns 400 when approving a non-SUBMITTED request', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(AUTH);

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// REJECT REQUEST
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/reject', () => {
  it('rejects a SUBMITTED request as manager', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    db.stockAdjustmentRequest.update.mockResolvedValue(makeFakeRequest('REJECTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ notes: 'Wrong quantities' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('returns 403 when operator tries to reject', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'OPERATOR' }]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/reject`)
      .set(AUTH);

    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// FINALIZE REQUEST — critical tests
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/finalize', () => {
  it('finalizes an APPROVED request and calls stockService.applyAdjustment for each item', async () => {
    const itemA = { ...fakeItem, id: 'item-a', qtyChange: { toString: () => '5' } };
    const itemB = { ...fakeItem, id: 'item-b', productId: 'prod-b', qtyChange: { toString: () => '-3' } };

    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('APPROVED', [itemA, itemB]));
    db.stockAdjustmentRequest.update.mockResolvedValue(makeFakeRequest('FINALIZED', [itemA, itemB]));

    // applyAdjustment internals
    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({
      id: 'bal', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '100', reservedQty: '0',
    });
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.update.mockResolvedValue({
      id: 'bal', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '105', reservedQty: '0',
    });
    db.stockLedger.create.mockResolvedValue({});

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZED');

    // applyAdjustment calls stockBalance.upsert + update (via stockService internal $transaction)
    expect(db.$transaction).toHaveBeenCalledTimes(2); // once per item
    expect(db.stockLedger.create).toHaveBeenCalledTimes(2);
  });

  it('creates ledger entries during finalization (ADJUSTMENT source type)', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('APPROVED', [fakeItem]));
    db.stockAdjustmentRequest.update.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));
    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({ id: 'b', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '10', reservedQty: '0' });
    db.$queryRaw.mockResolvedValue([{ onHandQty: '10', reservedQty: '0' }]);
    db.stockBalance.update.mockResolvedValue({ id: 'b', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '15', reservedQty: '0' });
    db.stockLedger.create.mockResolvedValue({ id: 'ledger-1', sourceType: 'ADJUSTMENT' });

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    const ledgerCall = db.stockLedger.create.mock.calls[0][0];
    expect(ledgerCall.data.sourceType).toBe('ADJUSTMENT');
    expect(ledgerCall.data.sourceId).toBe(REQ_ID);
  });

  it('cannot finalize a non-APPROVED request', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot finalize/);
  });

  it('cannot finalize twice (FINALIZED request returns 400)', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// EDIT ITEMS — DRAFT only enforcement
// ===========================================================================

describe('Cannot edit items after submission', () => {
  it('PUT item returns 400 when status is SUBMITTED', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .put(`/v1/stock-adjustments/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qtyChange: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });

  it('DELETE item returns 400 when status is APPROVED', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('APPROVED', [fakeItem]));

    const res = await request(app)
      .delete(`/v1/stock-adjustments/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });

  it('can edit items when status is DRAFT', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockAdjustmentItem.findUnique.mockResolvedValue({ ...fakeItem, requestId: REQ_ID });
    db.stockAdjustmentItem.update.mockResolvedValue({ ...fakeItem, qtyChange: { toString: () => '10' } });

    const res = await request(app)
      .put(`/v1/stock-adjustments/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qtyChange: 10 });

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// REQUEST NUMBER FORMAT
// ===========================================================================

describe('Request number generation', () => {
  it('generates ADJ-YYYYMMDD-XXXX format', async () => {
    db.stockAdjustmentRequest.count.mockResolvedValue(0);
    db.stockAdjustmentRequest.create.mockImplementation((args: any) => Promise.resolve({
      ...makeFakeRequest('DRAFT'),
      requestNumber: args.data.requestNumber,
    }));

    const res = await request(app)
      .post('/v1/stock-adjustments')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.data.requestNumber).toMatch(/^ADJ-\d{8}-\d{4}$/);
  });
});
