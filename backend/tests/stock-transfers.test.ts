/**
 * Stock Transfer Requests — Stage 6 Tests (7-state workflow)
 *
 * Workflow: DRAFT → SUBMITTED → ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE → FINALIZED
 *           Any pre-terminal state can be → CANCELLED
 *           DRAFT can also be → deleted (DELETE /:id)
 *
 * Covers: auth enforcement, create, request number format, add/edit/delete items,
 * submit, approve-origin, approve-destination, finalize (stock moves, ledger),
 * cancel, delete DRAFT, location authorization, same-location guard,
 * no-items guard, concurrency protection.
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn().mockReturnValue({
      sub:     'user-id',
      email:   'user@example.com',
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
  });

  return {
    __esModule: true,
    default: {
      stockTransferRequest: createMock(),
      stockTransferItem:    createMock(),
      stockBalance:         createMock(),
      stockLedger:          createMock(),
      product:              createMock(),
      location:             createMock(),
      userLocationRole:     createMock(),
      auditLog:             { create: jest.fn().mockResolvedValue({}) },
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
const AUTH = { Authorization: 'Bearer valid.token.here' };

const REQ_ID      = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SRC_LOC_ID  = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DST_LOC_ID  = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const USER_ID     = 'user-id';

const fakeUser      = { id: USER_ID, email: 'user@example.com', phone: null };
const fakeSourceLoc = { id: SRC_LOC_ID, code: 'WH-A', name: 'Warehouse A' };
const fakeDestLoc   = { id: DST_LOC_ID, code: 'ST-B', name: 'Store B' };

const fakeItem = {
  id:        ITEM_ID,
  requestId: REQ_ID,
  productId: PRODUCT_ID,
  qty:       { toString: () => '10' },
  createdAt: new Date().toISOString(),
  product:   { id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop', uom: { code: 'PCS' } },
};

function makeFakeRequest(status = 'DRAFT', items: any[] = []) {
  return {
    id:                      REQ_ID,
    requestNumber:           'TRF-20260317-WH-A-ST-B-0001',
    status,
    sourceLocationId:        SRC_LOC_ID,
    destinationLocationId:   DST_LOC_ID,
    notes:                   null,
    createdById:             USER_ID,
    submittedAt:             null,
    originApprovedById:      null,
    originApprovedAt:        null,
    destinationApprovedById: null,
    destinationApprovedAt:   null,
    finalizedAt:             null,
    cancelledById:           null,
    cancelledAt:             null,
    rejectedById:            null,
    rejectedAt:              null,
    rejectionReason:         null,
    createdAt:               new Date().toISOString(),
    updatedAt:               new Date().toISOString(),
    createdBy:               fakeUser,
    originApprovedBy:        null,
    destinationApprovedBy:   null,
    cancelledBy:             null,
    rejectedBy:              null,
    sourceLocation:          fakeSourceLoc,
    destinationLocation:     fakeDestLoc,
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
  // resetAllMocks clears instances/calls/results AND the mockResolvedValueOnce queue,
  // preventing leftover Once values from previous tests polluting subsequent tests.
  jest.resetAllMocks();

  (authService.verifyAccessToken as jest.Mock).mockReturnValue({
    sub:     USER_ID,
    email:   'user@example.com',
    phone:   null,
    isAdmin: false,
  });

  // Default: location lookups succeed
  db.location.findUnique.mockImplementation(({ where }: any) => {
    if (where.id === SRC_LOC_ID) return Promise.resolve(fakeSourceLoc);
    if (where.id === DST_LOC_ID) return Promise.resolve(fakeDestLoc);
    return Promise.resolve(null);
  });

  // Default: product lookup succeeds
  db.product.findUnique.mockResolvedValue({ id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop' });

  // moveStock internals
  db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
  db.stockBalance.upsert.mockResolvedValue({ id: 'bal', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '100', reservedQty: '0' });
  db.stockBalance.update.mockResolvedValue({ id: 'bal', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '90', reservedQty: '0' });
  db.stockLedger.create.mockResolvedValue({});

  // Claim operations succeed by default
  db.stockTransferRequest.updateMany.mockResolvedValue({ count: 1 });
  db.stockTransferItem.deleteMany.mockResolvedValue({ count: 0 });
  db.stockTransferRequest.delete.mockResolvedValue({});

  // Default: user is a MANAGER with access to source location.
  // Uses argument-based implementation so role-check calls and location-check calls
  // can be differentiated without relying on Once queue ordering.
  db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
    // Manager role check: { userId, role: 'MANAGER' }
    if (where.role === 'MANAGER') {
      return Promise.resolve({ id: 'role-1', userId: USER_ID, role: 'MANAGER' });
    }
    // Location access check: { userId, locationId }
    if (where.locationId) {
      return Promise.resolve({ id: 'role-1', userId: USER_ID, locationId: where.locationId, role: 'MANAGER' });
    }
    return Promise.resolve(null);
  });
  db.userLocationRole.findMany.mockResolvedValue([{ role: 'MANAGER' }]);
});

// ===========================================================================
// 1. AUTH ENFORCEMENT
// ===========================================================================

describe('Auth enforcement on stock-transfers routes', () => {
  it('returns 401 without token on GET /v1/stock-transfers', async () => {
    const res = await request(app).get('/v1/stock-transfers');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 without token on POST /v1/stock-transfers', async () => {
    const res = await request(app).post('/v1/stock-transfers').send({});
    expect(res.status).toBe(401);
  });

  it('returns 401 without token on POST /v1/stock-transfers/:id/finalize', async () => {
    const res = await request(app).post(`/v1/stock-transfers/${REQ_ID}/finalize`);
    expect(res.status).toBe(401);
  });

  it('returns 401 without token on POST /v1/stock-transfers/:id/submit', async () => {
    const res = await request(app).post(`/v1/stock-transfers/${REQ_ID}/submit`);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 2. CREATE REQUEST
// ===========================================================================

describe('POST /v1/stock-transfers — create request', () => {
  it('creates a new DRAFT transfer request', async () => {
    const fake = makeFakeRequest('DRAFT');
    db.stockTransferRequest.count.mockResolvedValue(0);
    db.stockTransferRequest.create.mockResolvedValue(fake);

    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID, destinationLocationId: DST_LOC_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.requestNumber).toMatch(/^TRF-\d{8}-WH-A-ST-B-\d{4}$/);
  });

  it('creates request with notes', async () => {
    const fake = { ...makeFakeRequest('DRAFT'), notes: 'Monthly restock' };
    db.stockTransferRequest.count.mockResolvedValue(0);
    db.stockTransferRequest.create.mockResolvedValue(fake);

    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID, destinationLocationId: DST_LOC_ID, notes: 'Monthly restock' });

    expect(res.status).toBe(201);
    expect(res.body.data.notes).toBe('Monthly restock');
  });

  it('returns 400 when sourceLocationId equals destinationLocationId', async () => {
    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID, destinationLocationId: SRC_LOC_ID });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/different/);
  });

  it('returns 400 when sourceLocationId is missing', async () => {
    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ destinationLocationId: DST_LOC_ID });

    expect(res.status).toBe(400);
  });

  it('returns 400 when destinationLocationId is missing', async () => {
    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID });

    expect(res.status).toBe(400);
  });

  it('returns 400 when sourceLocationId is not a valid UUID', async () => {
    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: 'not-a-uuid', destinationLocationId: DST_LOC_ID });

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 3. REQUEST NUMBER FORMAT
// ===========================================================================

describe('Request number generation', () => {
  it('generates TRF-YYYYMMDD-XXXX format', async () => {
    db.stockTransferRequest.count.mockResolvedValue(0);
    db.stockTransferRequest.create.mockImplementation((args: any) => Promise.resolve({
      ...makeFakeRequest('DRAFT'),
      requestNumber: args.data.requestNumber,
    }));

    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID, destinationLocationId: DST_LOC_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.requestNumber).toMatch(/^TRF-\d{8}-WH-A-ST-B-\d{4}$/);
  });

  it('sequences correctly — 4th request of the day gets 0004', async () => {
    db.stockTransferRequest.count.mockResolvedValue(3);
    db.stockTransferRequest.create.mockImplementation((args: any) => Promise.resolve({
      ...makeFakeRequest('DRAFT'),
      requestNumber: args.data.requestNumber,
    }));

    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID, destinationLocationId: DST_LOC_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.requestNumber).toMatch(/^TRF-\d{8}-WH-A-ST-B-0004$/);
  });
});

// ===========================================================================
// 4. GET LIST
// ===========================================================================

describe('GET /v1/stock-transfers — list', () => {
  it('returns paginated list', async () => {
    db.stockTransferRequest.findMany.mockResolvedValue([makeFakeRequest()]);
    db.stockTransferRequest.count.mockResolvedValue(1);

    const res = await request(app).get('/v1/stock-transfers').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
  });

  it('filters by status=DRAFT', async () => {
    db.stockTransferRequest.findMany.mockResolvedValue([makeFakeRequest('DRAFT')]);
    db.stockTransferRequest.count.mockResolvedValue(1);

    const res = await request(app).get('/v1/stock-transfers?status=DRAFT').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('DRAFT');
    const callArgs = db.stockTransferRequest.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('DRAFT');
  });

  it('filters by status=SUBMITTED', async () => {
    db.stockTransferRequest.findMany.mockResolvedValue([makeFakeRequest('SUBMITTED')]);
    db.stockTransferRequest.count.mockResolvedValue(1);

    const res = await request(app).get('/v1/stock-transfers?status=SUBMITTED').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('SUBMITTED');
  });

  it('returns 400 for invalid status filter', async () => {
    const res = await request(app).get('/v1/stock-transfers?status=INVALID').set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid status/);
  });
});

// ===========================================================================
// 5. GET BY ID
// ===========================================================================

describe('GET /v1/stock-transfers/:id', () => {
  it('returns a transfer with items', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));

    const res = await request(app).get(`/v1/stock-transfers/${REQ_ID}`).set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(REQ_ID);
    expect(res.body.data.items).toHaveLength(1);
  });

  it('returns 404 for unknown id', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(null);

    const res = await request(app).get(`/v1/stock-transfers/${REQ_ID}`).set(AUTH);

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 6. ADD ITEM
// ===========================================================================

describe('POST /v1/stock-transfers/:id/items — add item', () => {
  it('adds an item to a DRAFT request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT'));
    db.stockTransferItem.create.mockResolvedValue(fakeItem);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 10 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.productId).toBe(PRODUCT_ID);
  });

  it('returns 400 when qty is missing', async () => {
    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID });

    expect(res.status).toBe(400);
  });

  it('returns 400 when qty is zero', async () => {
    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/greater than 0/);
  });

  it('returns 400 when qty is negative', async () => {
    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/greater than 0/);
  });

  it('cannot add items when request is not DRAFT', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED'));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });

  it('returns 400 when productId is not a valid UUID', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT'));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: 'not-a-uuid', qty: 5 });

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 7. EDIT ITEM
// ===========================================================================

describe('PUT /v1/stock-transfers/:id/items/:itemId — edit item', () => {
  it('can edit qty when request is DRAFT', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockTransferItem.findUnique.mockResolvedValue({ ...fakeItem, requestId: REQ_ID });
    db.stockTransferItem.update.mockResolvedValue({ ...fakeItem, qty: { toString: () => '20' } });

    const res = await request(app)
      .put(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qty: 20 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when editing item on a FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .put(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qty: 20 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });

  it('returns 400 when new qty is zero', async () => {
    const res = await request(app)
      .put(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qty: 0 });

    expect(res.status).toBe(400);
  });

  it('returns 404 when item belongs to a different request', async () => {
    const OTHER_REQ = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockTransferItem.findUnique.mockResolvedValue({ ...fakeItem, requestId: OTHER_REQ });

    const res = await request(app)
      .put(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qty: 20 });

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 8. DELETE ITEM
// ===========================================================================

describe('DELETE /v1/stock-transfers/:id/items/:itemId — delete item', () => {
  it('deletes an item from a DRAFT request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockTransferItem.findUnique.mockResolvedValue({ ...fakeItem, requestId: REQ_ID });
    db.stockTransferItem.delete.mockResolvedValue({});

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH);

    expect(res.status).toBe(204);
  });

  it('returns 400 when deleting from a FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });
});

// ===========================================================================
// 9. SUBMIT
// ===========================================================================

describe('POST /v1/stock-transfers/:id/submit', () => {
  it('submits a DRAFT request → status SUBMITTED', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('DRAFT', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('returns 400 when trying to submit a SUBMITTED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot submit/);
  });

  it('returns 400 when submitting a DRAFT with no items', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', []));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/at least one item/);
  });

  it('returns 403 when user has no access to source location', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/submit`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });
});

// ===========================================================================
// 10. APPROVE ORIGIN
// ===========================================================================

describe('POST /v1/stock-transfers/:id/approve-origin', () => {
  it('manager can approve origin (SUBMITTED → ORIGIN_MANAGER_APPROVED)', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ORIGIN_MANAGER_APPROVED');
  });

  it('admin can approve origin without location assignment', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ORIGIN_MANAGER_APPROVED');
  });

  it('operator cannot approve origin (no MANAGER role at source) → 403', async () => {
    // findUnique must return a SUBMITTED request so the role check is reached
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    // findFirst returns null → no MANAGER role at source location
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only a manager at the source location/);
  });

  it('returns 400 when request is not SUBMITTED', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot approve origin/);
  });

  it('manager at a different location (not source) cannot approve origin → 403', async () => {
    // User is MANAGER at DST_LOC_ID only, not at SRC_LOC_ID
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    // Combined query { userId, locationId: SRC_LOC_ID, role: 'MANAGER' } → null
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only a manager at the source location/);
  });

  it('returns 400 when trying to approve origin with no items', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', []));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no items/);
  });

  it('operator at source location cannot approve origin (OPERATOR not MANAGER) → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    // User has OPERATOR role at source — not MANAGER, so combined query returns null
    db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
      // Query is { userId, locationId: SRC_LOC_ID, role: 'MANAGER' } → no match for OPERATOR
      if (where.role === 'MANAGER') return Promise.resolve(null);
      return Promise.resolve({ id: 'role-1', role: 'OPERATOR' });
    });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only a manager at the source location/);
  });

  it('manager at source location CAN approve origin (location-specific MANAGER role) → 200', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]));
    // Combined query { userId, locationId: SRC_LOC_ID, role: 'MANAGER' } → match
    db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
      if (where.role === 'MANAGER' && where.locationId === SRC_LOC_ID) {
        return Promise.resolve({ id: 'role-1', userId: USER_ID, locationId: SRC_LOC_ID, role: 'MANAGER' });
      }
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-origin`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ORIGIN_MANAGER_APPROVED');
  });
});

// ===========================================================================
// 11. APPROVE DESTINATION
// ===========================================================================

describe('POST /v1/stock-transfers/:id/approve-destination', () => {
  it('user with destination access can approve (ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE)', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]));
    // assertUserCanAccessLocation checks DST_LOC_ID
    db.userLocationRole.findFirst.mockResolvedValue({ role: 'OPERATOR', locationId: DST_LOC_ID });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-destination`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('READY_TO_FINALIZE');
  });

  it('admin can approve destination without location assignment', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-destination`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('READY_TO_FINALIZE');
  });

  it('user without destination location access cannot approve → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]));
    // Override: no location access at all
    db.userLocationRole.findFirst.mockImplementation(() => Promise.resolve(null));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-destination`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });

  it('operator at destination location can approve destination (any role allowed) → 200', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]));
    // User has OPERATOR role at destination — any role at destination is sufficient
    db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
      if (where.locationId === DST_LOC_ID) {
        return Promise.resolve({ id: 'role-1', userId: USER_ID, locationId: DST_LOC_ID, role: 'OPERATOR' });
      }
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-destination`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('READY_TO_FINALIZE');
  });

  it('user with source access but NO destination access cannot approve destination → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]));
    // Has access to SRC but not DST
    db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
      if (where.locationId === SRC_LOC_ID) return Promise.resolve({ id: 'role-1', role: 'MANAGER' });
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-destination`)
      .set(AUTH);

    expect(res.status).toBe(403);
  });

  it('returns 400 when request is not ORIGIN_MANAGER_APPROVED', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/approve-destination`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot approve destination/);
  });
});

// ===========================================================================
// 12. FINALIZE — main scenario
// ===========================================================================

describe('POST /v1/stock-transfers/:id/finalize', () => {
  it('finalizes a READY_TO_FINALIZE request and creates TWO ledger entries per item', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({ id: 'bal', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '100', reservedQty: '0' });
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.update
      .mockResolvedValueOnce({ id: 'bal', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '90', reservedQty: '0' })
      .mockResolvedValueOnce({ id: 'bal', productId: PRODUCT_ID, locationId: DST_LOC_ID, onHandQty: '10', reservedQty: '0' });
    db.stockLedger.create.mockResolvedValue({});

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZED');

    // Two $transaction calls: one for TRANSFER_OUT, one for TRANSFER_IN
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    // Two ledger entries created
    expect(db.stockLedger.create).toHaveBeenCalledTimes(2);
  });

  it('creates TRANSFER_OUT ledger entry for source location', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({ id: 'b', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '100', reservedQty: '0' });
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.update.mockResolvedValue({ id: 'b', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '90', reservedQty: '0' });
    db.stockLedger.create.mockResolvedValue({});

    await request(app).post(`/v1/stock-transfers/${REQ_ID}/finalize`).set(AUTH);

    const firstLedgerCall = db.stockLedger.create.mock.calls[0][0];
    expect(firstLedgerCall.data.sourceType).toBe('TRANSFER_OUT');
    expect(firstLedgerCall.data.sourceId).toBe(REQ_ID);
    expect(firstLedgerCall.data.locationId).toBe(SRC_LOC_ID);
    expect(Number(firstLedgerCall.data.changeQty)).toBe(-10);
  });

  it('creates TRANSFER_IN ledger entry for destination location', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({ id: 'b', productId: PRODUCT_ID, locationId: DST_LOC_ID, onHandQty: '0', reservedQty: '0' });
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.update
      .mockResolvedValueOnce({ id: 'b', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '90', reservedQty: '0' })
      .mockResolvedValueOnce({ id: 'b', productId: PRODUCT_ID, locationId: DST_LOC_ID, onHandQty: '10', reservedQty: '0' });
    db.stockLedger.create.mockResolvedValue({});

    await request(app).post(`/v1/stock-transfers/${REQ_ID}/finalize`).set(AUTH);

    const secondLedgerCall = db.stockLedger.create.mock.calls[1][0];
    expect(secondLedgerCall.data.sourceType).toBe('TRANSFER_IN');
    expect(secondLedgerCall.data.sourceId).toBe(REQ_ID);
    expect(secondLedgerCall.data.locationId).toBe(DST_LOC_ID);
    expect(Number(secondLedgerCall.data.changeQty)).toBe(10);
  });

  it('stock decreases at source and increases at destination', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.upsert.mockResolvedValue({ id: 'b', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '100', reservedQty: '0' });
    db.stockBalance.update
      .mockResolvedValueOnce({ id: 'b', onHandQty: '90', reservedQty: '0' })   // source decremented
      .mockResolvedValueOnce({ id: 'b', onHandQty: '10', reservedQty: '0' });  // destination incremented
    db.stockLedger.create.mockResolvedValue({});

    const res = await request(app).post(`/v1/stock-transfers/${REQ_ID}/finalize`).set(AUTH);

    expect(res.status).toBe(200);
    const updateCalls = db.stockBalance.update.mock.calls;
    expect(updateCalls).toHaveLength(2);
    const sourceDecrement = updateCalls[0][0].data;
    const destIncrement   = updateCalls[1][0].data;
    expect(sourceDecrement.onHandQty?.decrement || sourceDecrement.onHandQty?.increment).toBeDefined();
    expect(destIncrement.onHandQty?.increment).toBeDefined();
  });

  it('finalizes with multiple items — creates 2 ledger entries per item', async () => {
    const itemA = { ...fakeItem, id: 'item-a', qty: { toString: () => '5' } };
    const itemB = { ...fakeItem, id: 'item-b', productId: 'prod-b', qty: { toString: () => '3' } };

    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [itemA, itemB]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [itemA, itemB]));

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.upsert.mockResolvedValue({ id: 'b', onHandQty: '100', reservedQty: '0' });
    db.stockBalance.update.mockResolvedValue({ id: 'b', onHandQty: '95', reservedQty: '0' });
    db.stockLedger.create.mockResolvedValue({});

    const res = await request(app).post(`/v1/stock-transfers/${REQ_ID}/finalize`).set(AUTH);

    expect(res.status).toBe(200);
    // 2 items × 2 transactions each = 4 total transactions
    expect(db.$transaction).toHaveBeenCalledTimes(4);
    // 2 items × 2 ledger entries each = 4 total ledger entries
    expect(db.stockLedger.create).toHaveBeenCalledTimes(4);
  });
});

// ===========================================================================
// 13. CANNOT FINALIZE WITH NO ITEMS
// ===========================================================================

describe('Cannot finalize transfer with no items', () => {
  it('returns 400 when trying to finalize a READY_TO_FINALIZE request with no items', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('READY_TO_FINALIZE', []));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no items/);
  });
});

// ===========================================================================
// 14. CANNOT FINALIZE UNLESS READY_TO_FINALIZE STATUS
// ===========================================================================

describe('Finalize requires READY_TO_FINALIZE status', () => {
  it('returns 400 when trying to finalize a DRAFT request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot finalize a request with status DRAFT/);
  });

  it('returns 400 when trying to finalize a SUBMITTED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot finalize a request with status SUBMITTED/);
  });

  it('returns 400 when trying to finalize an already FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot finalize/);
  });

  it('returns 400 when trying to finalize a CANCELLED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 15. CANNOT FINALIZE WHEN SOURCE AND DESTINATION ARE THE SAME
// ===========================================================================

describe('Cannot finalize when source and destination locations are identical', () => {
  it('returns 400 when sourceLocationId === destinationLocationId', async () => {
    const sameLocId = SRC_LOC_ID;
    db.stockTransferRequest.findUnique.mockResolvedValue({
      ...makeFakeRequest('READY_TO_FINALIZE', [fakeItem]),
      sourceLocationId:      sameLocId,
      destinationLocationId: sameLocId,
    });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Source and destination locations must be different/);
  });
});

// ===========================================================================
// 16. CONCURRENCY PROTECTION
// ===========================================================================

describe('Concurrency — finalize protection', () => {
  it('returns 400 when updateMany claim returns count=0 (concurrent finalization)', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]));
    // Simulate race: another process already finalized it
    db.stockTransferRequest.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 17. CANNOT ADD/EDIT/DELETE ITEMS AFTER SUBMISSION
// ===========================================================================

describe('Cannot modify items after submission', () => {
  it('cannot add item to SUBMITTED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED'));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });

  it('cannot edit item on FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .put(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH)
      .send({ qty: 20 });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });

  it('cannot delete item on CANCELLED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });
});

// ===========================================================================
// 18. QTY VALIDATION
// ===========================================================================

describe('Qty validation', () => {
  it('accepts fractional positive qty', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT'));
    db.stockTransferItem.create.mockResolvedValue({ ...fakeItem, qty: { toString: () => '0.5' } });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 0.5 });

    expect(res.status).toBe(201);
  });

  it('rejects qty of exactly 0', async () => {
    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 0 });

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 19. DATE FILTER VALIDATION
// ===========================================================================

describe('Date filter validation', () => {
  it('returns 400 for invalid startDate', async () => {
    const res = await request(app).get('/v1/stock-transfers?startDate=not-a-date').set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid startDate/);
  });

  it('returns 400 for invalid endDate', async () => {
    const res = await request(app).get('/v1/stock-transfers?endDate=not-a-date').set(AUTH);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid endDate/);
  });
});

// ===========================================================================
// 20. CANCEL
// ===========================================================================

describe('POST /v1/stock-transfers/:id/cancel', () => {
  it('cannot cancel a DRAFT request — use Delete instead → 400', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot cancel/);
  });

  it('creator can cancel a SUBMITTED request', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(200);
  });

  it('creator can cancel an ORIGIN_MANAGER_APPROVED request', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(200);
  });

  it('returns 400 when trying to cancel an already FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot cancel/);
  });

  it('non-creator with no location access cannot cancel → 403', async () => {
    // Use SUBMITTED (not DRAFT) since DRAFT is no longer cancellable — use Delete for DRAFTs
    const otherUsersRequest = { ...makeFakeRequest('SUBMITTED', [fakeItem]), createdById: 'other-user-id' };
    db.stockTransferRequest.findUnique.mockResolvedValue(otherUsersRequest);
    // Explicitly no location access
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator, a location participant, or an admin/);
  });

  it('admin can cancel any request regardless of creator', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    const otherUsersRequest = { ...makeFakeRequest('SUBMITTED', [fakeItem]), createdById: 'other-user-id' };
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(otherUsersRequest)
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 21. DELETE DRAFT REQUEST
// ===========================================================================

describe('DELETE /v1/stock-transfers/:id — delete DRAFT request', () => {
  it('creator can delete a DRAFT request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockTransferItem.deleteMany.mockResolvedValue({ count: 1 });
    db.stockTransferRequest.delete.mockResolvedValue({});

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(204);
  });

  it('returns 400 when trying to delete a SUBMITTED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Only DRAFT/);
  });

  it('non-creator cannot delete another user\'s DRAFT → 403', async () => {
    const otherUsersRequest = { ...makeFakeRequest('DRAFT', [fakeItem]), createdById: 'other-user-id' };
    db.stockTransferRequest.findUnique.mockResolvedValue(otherUsersRequest);

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator/);
  });

  it('admin can delete any DRAFT request', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    const otherUsersRequest = { ...makeFakeRequest('DRAFT', [fakeItem]), createdById: 'other-user-id' };
    db.stockTransferRequest.findUnique.mockResolvedValue(otherUsersRequest);
    db.stockTransferItem.deleteMany.mockResolvedValue({ count: 1 });
    db.stockTransferRequest.delete.mockResolvedValue({});

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}`)
      .set(AUTH);

    expect(res.status).toBe(204);
  });
});

// ===========================================================================
// 22. LOCATION AUTHORIZATION — CROSS-WAREHOUSE ACCESS DENIED
// ===========================================================================

describe('Location authorization — cross-warehouse access denied', () => {
  it('operator cannot add item to request from another warehouse → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', []));
    // User has NO role at source location
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 5 });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });

  it('operator cannot delete item from request at another warehouse → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    db.stockTransferItem.findUnique.mockResolvedValue(fakeItem);
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });

  it('operator cannot finalize request from another warehouse → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]));
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });

  it('user with source access only (no destination access) cannot finalize → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]));
    // Has access to SRC_LOC_ID but not DST_LOC_ID
    db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
      if (where.locationId === SRC_LOC_ID) return Promise.resolve({ id: 'role-1', role: 'MANAGER' });
      return Promise.resolve(null);
    });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });

  it('admin can finalize any request regardless of location assignment', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));
    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({ id: 'b', onHandQty: '100', reservedQty: '0' });
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.update
      .mockResolvedValueOnce({ id: 'b', onHandQty: '90', reservedQty: '0' })
      .mockResolvedValueOnce({ id: 'b', onHandQty: '10', reservedQty: '0' });
    db.stockLedger.create.mockResolvedValue({});

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 23. SOURCE LOCATION OWNERSHIP ON CREATE
// ===========================================================================

describe('Source location ownership on create', () => {
  it('returns 403 when non-admin user has no role at sourceLocationId', async () => {
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID, destinationLocationId: DST_LOC_ID });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });

  it('admin can create request for any source location', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockTransferRequest.count.mockResolvedValue(0);
    db.stockTransferRequest.create.mockResolvedValue(makeFakeRequest('DRAFT'));

    const res = await request(app)
      .post('/v1/stock-transfers')
      .set(AUTH)
      .send({ sourceLocationId: SRC_LOC_ID, destinationLocationId: DST_LOC_ID });

    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// 24. REJECT
// ===========================================================================

describe('POST /v1/stock-transfers/:id/reject', () => {
  // ── Stage 1 reject: SUBMITTED → REJECTED by source MANAGER ────────────

  it('source MANAGER can reject a SUBMITTED request → 200 (REJECTED)', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('REJECTED', [fakeItem]));
    // Default findFirst mock returns MANAGER role at source location

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'Stock not available' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('returns 400 when no reason is provided', async () => {
    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/rejection reason is required/i);
  });

  it('user without MANAGER role at source cannot reject SUBMITTED → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    // No MANAGER role at source location
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only a manager at the source location/);
  });

  it('OPERATOR at source (not MANAGER) cannot reject SUBMITTED → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('SUBMITTED', [fakeItem]));
    // Has OPERATOR role at source but not MANAGER
    db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
      if (where.role === 'MANAGER') return Promise.resolve(null);
      return Promise.resolve({ id: 'role-1', userId: USER_ID, locationId: SRC_LOC_ID, role: 'OPERATOR' });
    });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only a manager at the source location/);
  });

  it('admin can reject a SUBMITTED request → 200', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('SUBMITTED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('REJECTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(200);
  });

  // ── Stage 2 reject: ORIGIN_MANAGER_APPROVED → REJECTED by dest user ───

  it('destination user can reject an ORIGIN_MANAGER_APPROVED request → 200', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('REJECTED', [fakeItem]));
    // Default findFirst: returns role at DST_LOC_ID (assertUserCanAccessLocation check)

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'Cannot accept this transfer' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
  });

  it('user without destination access cannot reject ORIGIN_MANAGER_APPROVED → 403', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]));
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/You do not have access to this location/);
  });

  it('admin can reject an ORIGIN_MANAGER_APPROVED request → 200', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('ORIGIN_MANAGER_APPROVED', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('REJECTED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(200);
  });

  // ── Invalid status for reject ────────────────────────────────────────────

  it('returns 400 when trying to reject a FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot reject a request with status FINALIZED/);
  });

  it('returns 400 when trying to reject a DRAFT request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot reject a request with status DRAFT/);
  });

  it('returns 400 when trying to reject a READY_TO_FINALIZE request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/reject`)
      .set(AUTH)
      .send({ reason: 'test reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot reject a request with status READY_TO_FINALIZE/);
  });
});

// ===========================================================================
// 25. CANCEL — LOCATION PARTICIPANT ACCESS (F2)
// ===========================================================================

describe('POST /v1/stock-transfers/:id/cancel — location participant access', () => {
  it('destination user (not creator) can cancel a READY_TO_FINALIZE request → 200', async () => {
    const otherUsersRequest = { ...makeFakeRequest('READY_TO_FINALIZE', [fakeItem]), createdById: 'other-user-id' };
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(otherUsersRequest)
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));
    // User has access to DST_LOC_ID (destination) via the OR location check
    db.userLocationRole.findFirst.mockResolvedValue({ id: 'role-1', userId: USER_ID, locationId: DST_LOC_ID, role: 'OPERATOR' });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(200);
  });

  it('source user (not creator) can cancel a SUBMITTED request → 200', async () => {
    const otherUsersRequest = { ...makeFakeRequest('SUBMITTED', [fakeItem]), createdById: 'other-user-id' };
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(otherUsersRequest)
      .mockResolvedValueOnce(makeFakeRequest('CANCELLED', [fakeItem]));
    db.userLocationRole.findFirst.mockResolvedValue({ id: 'role-1', userId: USER_ID, locationId: SRC_LOC_ID, role: 'MANAGER' });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(200);
  });

  it('user with no location access (and not creator) cannot cancel → 403', async () => {
    const otherUsersRequest = { ...makeFakeRequest('SUBMITTED', [fakeItem]), createdById: 'other-user-id' };
    db.stockTransferRequest.findUnique.mockResolvedValue(otherUsersRequest);
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/cancel`)
      .set(AUTH);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Only the creator, a location participant, or an admin/);
  });
});

// ===========================================================================
// 26. LIST FILTERING — LOCATION VISIBILITY (F3)
// ===========================================================================

describe('GET /v1/stock-transfers — location-based filtering', () => {
  it('non-admin only sees requests for their locations (OR filter applied)', async () => {
    // Override findMany to return role with locationId
    db.userLocationRole.findMany.mockResolvedValue([{ locationId: SRC_LOC_ID, role: 'MANAGER' }]);
    db.stockTransferRequest.findMany.mockResolvedValue([]);
    db.stockTransferRequest.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/v1/stock-transfers')
      .set(AUTH);

    expect(res.status).toBe(200);
    const findManyCall = db.stockTransferRequest.findMany.mock.calls[0][0];
    expect(findManyCall.where.OR).toBeDefined();
    expect(findManyCall.where.OR[0].sourceLocationId.in).toContain(SRC_LOC_ID);
  });

  it('admin sees all requests with no location filter', async () => {
    (authService.verifyAccessToken as jest.Mock).mockReturnValue({
      sub: USER_ID, email: 'admin@example.com', phone: null, isAdmin: true,
    });
    db.stockTransferRequest.findMany.mockResolvedValue([]);
    db.stockTransferRequest.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/v1/stock-transfers')
      .set(AUTH);

    expect(res.status).toBe(200);
    const findManyCall = db.stockTransferRequest.findMany.mock.calls[0][0];
    expect(findManyCall.where.OR).toBeUndefined();
  });
});

// ===========================================================================
// 27. FINALIZE — DESTINATION-ONLY PERMISSION
// ===========================================================================

describe('Finalize — destination-only access requirement', () => {
  it('destination user (no source access) CAN finalize → 200', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('READY_TO_FINALIZE', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));
    // Has access to DST_LOC_ID but not SRC_LOC_ID
    db.userLocationRole.findFirst.mockImplementation(({ where }: any) => {
      if (where.locationId === DST_LOC_ID) return Promise.resolve({ id: 'role-1', userId: USER_ID, locationId: DST_LOC_ID, role: 'OPERATOR' });
      return Promise.resolve(null);
    });
    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.$queryRaw.mockResolvedValue([{ onHandQty: '100', reservedQty: '0' }]);
    db.stockBalance.upsert.mockResolvedValue({ id: 'b', onHandQty: '100', reservedQty: '0' });
    db.stockBalance.update.mockResolvedValue({ id: 'b', onHandQty: '90', reservedQty: '0' });
    db.stockLedger.create.mockResolvedValue({});

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('FINALIZED');
  });
});
