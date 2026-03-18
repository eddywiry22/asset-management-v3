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
    findMany:    jest.fn(),
    findUnique:  jest.fn(),
    findFirst:   jest.fn(),
    create:      jest.fn(),
    update:      jest.fn(),
    updateMany:  jest.fn(),
    delete:      jest.fn(),
    count:       jest.fn(),
    groupBy:     jest.fn(),
    upsert:      jest.fn(),
    aggregate:   jest.fn(),
  });

  return {
    __esModule: true,
    default: {
      stockAdjustmentRequest: createMock(),
      stockAdjustmentItem:    createMock(),
      stockBalance:           createMock(),
      stockLedger:            createMock(),
      stockReservation:       createMock(),
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
    id:                 REQ_ID,
    requestNumber:      'ADJ-20260310-WH-001-0001',
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

let db: any;
let authService: any;

beforeAll(async () => {
  db          = (await import('../src/config/database')).default;
  authService = (await import('../src/modules/auth/auth.service')).authService;
});

beforeEach(() => {
  jest.resetAllMocks();

  // Default: $transaction passes callback through (inner WithinTx methods execute)
  db.$transaction.mockImplementation(async (cb: Function) => await cb(db));

  // Default: manager user
  (authService.verifyAccessToken as jest.Mock).mockReturnValue({
    sub:     USER_ID,
    email:   'manager@example.com',
    phone:   null,
    isAdmin: false,
  });
  // User has MANAGER role
  db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'MANAGER' }]);
  // User has access to LOCATION_ID (satisfies assertUserCanAccessLocation)
  // Include `location` so that create() can extract location code for the request number
  db.userLocationRole.findFirst.mockResolvedValue({ id: 'role-1', userId: USER_ID, locationId: LOCATION_ID, role: 'MANAGER', location: { code: 'WH-001' } });
  // W3: default product/location lookups succeed
  db.product.findUnique.mockResolvedValue({ id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop' });
  db.location.findUnique.mockResolvedValue({ id: LOCATION_ID, code: 'WH-001', name: 'Main Warehouse' });
  // Stock internals
  db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
  db.stockBalance.findUnique.mockResolvedValue({ onHandQty: '100', reservedQty: '0' });
  db.stockBalance.upsert.mockResolvedValue({ id: 'bal', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '100', reservedQty: '0' });
  db.stockBalance.update.mockResolvedValue({ id: 'bal', productId: PRODUCT_ID, locationId: LOCATION_ID, onHandQty: '105', reservedQty: '0' });
  db.stockLedger.create.mockResolvedValue({});
  // Default stockReservation mocks: no active reservations
  db.stockReservation.aggregate.mockResolvedValue({ _sum: { qty: null } });
  db.stockReservation.create.mockResolvedValue({ id: 'res-1' });
  db.stockReservation.findMany.mockResolvedValue([]);
  db.stockReservation.update.mockResolvedValue({});
  // C1: default finalization claim succeeds
  db.stockAdjustmentRequest.updateMany.mockResolvedValue({ count: 1 });
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
    expect(res.body.data.requestNumber).toMatch(/^ADJ-\d{8}-WH-001-\d{4}$/);
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
    expect(res.body.data.requestNumber).toMatch(/^ADJ-\d{8}-WH-001-0004$/);
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

  // W12: invalid status returns 400
  it('returns 400 for an invalid status filter', async () => {
    const res = await request(app).get('/v1/stock-adjustments?status=INVALID').set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid status/);
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
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('REJECTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'Wrong quantities' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('returns 400 when no rejection reason is provided', async () => {
    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/reject`)
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/rejection reason is required/i);
  });

  it('returns 403 when operator tries to reject', async () => {
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'OPERATOR' }]);
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

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

    // C1: findUnique called twice — once at start (APPROVED), once at end (FINALIZED)
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('APPROVED', [itemA, itemB]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [itemA, itemB]));

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

    // ONE atomic $transaction: status update + applyAdjustmentTx for each item
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.stockLedger.create).toHaveBeenCalledTimes(2);
  });

  it('creates ledger entries during finalization (ADJUSTMENT source type)', async () => {
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));
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
    expect(res.body.data.requestNumber).toMatch(/^ADJ-\d{8}-WH-001-\d{4}$/);
  });
});

// ===========================================================================
// W10: Negative qtyChange is allowed
// ===========================================================================

describe('W10 — negative qtyChange is valid', () => {
  it('accepts negative qtyChange (stock decrease) and returns 201', async () => {
    const negItem = { ...fakeItem, qtyChange: { toString: () => '-3' } };
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT'));
    db.stockAdjustmentItem.create.mockResolvedValue(negItem);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: -3, reason: 'shrinkage' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// W11: Item belonging to a different request returns 404
// ===========================================================================

describe('W11 — item from different request returns 404', () => {
  it('returns 404 when item.requestId does not match the URL :id', async () => {
    const OTHER_REQ_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockAdjustmentItem.findUnique.mockResolvedValue({ ...fakeItem, requestId: OTHER_REQ_ID });

    const res = await request(app)
      .put(`/v1/stock-adjustments/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qtyChange: 10 });

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// W13: Finalize APPROVED request with no items
// ===========================================================================

describe('W13 — finalize APPROVED request with no items', () => {
  it('finalizes an APPROVED request that has no items (empty loop)', async () => {
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('APPROVED', []))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', []));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZED');
    // ONE transaction for status update even when no items
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// CANCEL
// ===========================================================================

describe('POST /v1/stock-adjustments/:id/cancel', () => {
  it('returns 400 when no cancellation reason is provided', async () => {
    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cancellation reason is required/i);
  });

  it('creator can cancel a DRAFT request → 200 (CANCELLED)', async () => {
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('DRAFT', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'No longer needed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('creator can cancel a SUBMITTED request → 200', async () => {
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'No longer needed' });

    expect(res.status).toBe(200);
  });

  it('creator can cancel an APPROVED request → 200', async () => {
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'No longer needed' });

    expect(res.status).toBe(200);
  });

  it('cannot cancel a FINALIZED request → 400', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot cancel a request with status FINALIZED/);
  });

  it('cannot cancel an already CANCELLED request → 400', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot cancel a request with status CANCELLED/);
  });

  it('manager at item location can cancel another user\'s request → 200', async () => {
    const otherUserReq = { ...makeFakeRequest('SUBMITTED', [fakeItem]), createdById: 'other-user-id' };
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(otherUserReq)
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));
    // Default findFirst returns MANAGER role at LOCATION_ID

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'No longer needed' });

    expect(res.status).toBe(200);
  });

  it('non-manager without item location access cannot cancel → 403', async () => {
    const otherUserReq = { ...makeFakeRequest('SUBMITTED', [fakeItem]), createdById: 'other-user-id' };
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(otherUserReq);
    // No MANAGER role at item location
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator, a manager at the item location, or an admin/);
  });

  it('admin can cancel any request regardless of creator → 200', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    const otherUserReq = { ...makeFakeRequest('APPROVED', [fakeItem]), createdById: 'other-user-id' };
    db.stockAdjustmentRequest.findUnique
      .mockResolvedValueOnce(otherUserReq)
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/cancel`)
      .set(AUTH)
      .send({ reason: 'Admin override' });

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// CANCELLED STATUS FILTER
// ===========================================================================

describe('GET /v1/stock-adjustments?status=CANCELLED', () => {
  it('can filter by CANCELLED status', async () => {
    db.stockAdjustmentRequest.findMany.mockResolvedValue([makeFakeRequest('CANCELLED', [fakeItem])]);
    db.stockAdjustmentRequest.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/stock-adjustments?status=CANCELLED')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('CANCELLED');
    const findArgs = db.stockAdjustmentRequest.findMany.mock.calls[0][0];
    expect(findArgs.where.status).toBe('CANCELLED');
  });
});

// ===========================================================================
// LIST FILTERING — LOCATION VISIBILITY
// ===========================================================================

describe('GET /v1/stock-adjustments — location-based filtering', () => {
  it('non-admin only sees requests for their locations', async () => {
    // Override findMany to return role with locationId
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: LOCATION_ID, role: 'MANAGER' }]);
    db.stockAdjustmentRequest.findMany.mockResolvedValue([makeFakeRequest('DRAFT', [fakeItem])]);
    db.stockAdjustmentRequest.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/stock-adjustments')
      .set(AUTH);

    expect(res.status).toBe(200);
    // Verify the repository was called with an OR filter scoping to accessible locations
    const findManyCall = db.stockAdjustmentRequest.findMany.mock.calls[0][0];
    expect(findManyCall.where.OR).toBeDefined();
    const locationFilter = findManyCall.where.OR[0];
    expect(locationFilter.items.some.locationId.in).toContain(LOCATION_ID);
  });

  it('admin sees all requests with no location filter', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockAdjustmentRequest.findMany.mockResolvedValue([]);
    db.stockAdjustmentRequest.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/v1/stock-adjustments')
      .set(AUTH);

    expect(res.status).toBe(200);
    // No items filter for admin
    const findManyCall = db.stockAdjustmentRequest.findMany.mock.calls[0][0];
    expect(findManyCall.where.items).toBeUndefined();
  });
});

// ===========================================================================
// DRAFT OWNERSHIP — only the creator can edit/submit
// ===========================================================================

describe('Draft ownership enforcement', () => {
  const OTHER_USER_ID = 'other-user-id';
  const otherUserDraft = () => ({ ...makeFakeRequest('DRAFT', [fakeItem]), createdById: OTHER_USER_ID });

  it('non-creator cannot add items to another user\'s DRAFT → 403', async () => {
    // Current user is USER_ID (not the creator)
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(otherUserDraft());

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: 5 });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator/);
  });

  it('admin cannot add items to another user\'s DRAFT → 403', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(otherUserDraft());

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: 5 });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator/);
  });

  it('non-creator cannot update items in another user\'s DRAFT → 403', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(otherUserDraft());

    const res = await request(app)
      .put(`/v1/stock-adjustments/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qtyChange: 10 });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator/);
  });

  it('non-creator cannot delete items from another user\'s DRAFT → 403', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(otherUserDraft());

    const res = await request(app)
      .delete(`/v1/stock-adjustments/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator/);
  });

  it('non-creator cannot submit another user\'s DRAFT → 403', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(
      { ...otherUserDraft(), items: [fakeItem] },
    );

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator/);
  });

  it('creator can add items to their own DRAFT → 201', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT'));
    db.stockAdjustmentItem.create.mockResolvedValue(fakeItem);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, qtyChange: 5 });

    expect(res.status).toBe(201);
  });

  it('creator can submit their own DRAFT → 200', async () => {
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockAdjustmentRequest.update.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
  });
});

// ===========================================================================
// RESERVATION EDGE CASES — Stage 7
// ===========================================================================

describe('approve — outbound stock check: insufficient available stock → 400', () => {
  it('returns 400 when outbound item exceeds available stock', async () => {
    const outboundItem = { ...fakeItem, qtyChange: { toString: () => '-20' } };
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [outboundItem]));

    // 5 on-hand, 0 reserved → available = 5. Outbound requests 20.
    db.stockBalance.findUnique.mockResolvedValue({ onHandQty: '5', reservedQty: '0' });
    db.stockReservation.aggregate.mockResolvedValue({ _sum: { qty: null } });

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Insufficient available stock/);
    // Status must NOT have changed
    expect(db.stockAdjustmentRequest.update).not.toHaveBeenCalled();
  });

  it('returns 200 when outbound item equals available stock exactly', async () => {
    const outboundItem = { ...fakeItem, qtyChange: { toString: () => '-5' } };
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [outboundItem]));
    const approved = makeFakeRequest('APPROVED', [outboundItem]);

    // Exactly 5 available — matches requested 5
    db.stockBalance.findUnique.mockResolvedValue({ onHandQty: '5', reservedQty: '0' });
    db.stockReservation.aggregate.mockResolvedValue({ _sum: { qty: null } });
    db.stockAdjustmentRequest.update.mockResolvedValue(approved);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
  });

  it('inbound items are not stock-checked during approve', async () => {
    // fakeItem has qtyChange=5 (positive = inbound) — no stock needed
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    db.stockBalance.findUnique.mockResolvedValue({ onHandQty: '0', reservedQty: '0' });
    const approved = makeFakeRequest('APPROVED', [fakeItem]);
    db.stockAdjustmentRequest.update.mockResolvedValue(approved);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/approve`)
      .set(AUTH);

    expect(res.status).toBe(200);
    // stockReservation.aggregate not called since item is inbound
    expect(db.stockReservation.aggregate).not.toHaveBeenCalled();
  });
});

describe('finalize — outbound item fails stock check at execution time → 400', () => {
  it('returns 400 and does not finalize when outbound item has insufficient stock', async () => {
    const outboundItem = { ...fakeItem, qtyChange: { toString: () => '-50' } };
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(makeFakeRequest('APPROVED', [outboundItem]));

    // Only 10 on-hand, but 50 requested outbound
    db.$queryRaw.mockResolvedValue([{ onHandQty: '10', reservedQty: '0' }]);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Insufficient available stock/);
    // No ledger entry should have been written
    expect(db.stockLedger.create).not.toHaveBeenCalled();
  });
});
