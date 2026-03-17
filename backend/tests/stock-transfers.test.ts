/**
 * Stock Transfer Requests — Stage 6 Tests
 *
 * Covers: auth enforcement, create request, request number format,
 * add/edit/delete items, qty validation (> 0), cannot modify after finalize,
 * cannot finalize with no items, cannot finalize if locations same,
 * finalization creates TWO ledger entries per item (TRANSFER_OUT + TRANSFER_IN),
 * stock decreases at source, stock increases at destination,
 * concurrency finalize protection.
 *
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

const fakeUser        = { id: USER_ID, email: 'user@example.com', phone: null };
const fakeSourceLoc   = { id: SRC_LOC_ID, code: 'WH-A', name: 'Warehouse A' };
const fakeDestLoc     = { id: DST_LOC_ID, code: 'ST-B', name: 'Store B' };

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
    id:                    REQ_ID,
    requestNumber:         'TRF-20260310-0001',
    status,
    sourceLocationId:      SRC_LOC_ID,
    destinationLocationId: DST_LOC_ID,
    notes:                 null,
    createdById:           USER_ID,
    finalizedAt:           null,
    createdAt:             new Date().toISOString(),
    updatedAt:             new Date().toISOString(),
    createdBy:             fakeUser,
    sourceLocation:        fakeSourceLoc,
    destinationLocation:   fakeDestLoc,
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

  // Claim finalization succeeds by default
  db.stockTransferRequest.updateMany.mockResolvedValue({ count: 1 });
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
    expect(res.body.data.requestNumber).toBe('TRF-20260310-0001');
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
    expect(res.body.data.requestNumber).toMatch(/^TRF-\d{8}-\d{4}$/);
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
    expect(res.body.data.requestNumber).toMatch(/^TRF-\d{8}-0004$/);
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
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED'));

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
// 9. FINALIZE — main scenario
// ===========================================================================

describe('POST /v1/stock-transfers/:id/finalize', () => {
  it('finalizes a DRAFT request and creates TWO ledger entries per item (TRANSFER_OUT + TRANSFER_IN)', async () => {
    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('DRAFT', [fakeItem]))
      .mockResolvedValueOnce(makeFakeRequest('FINALIZED', [fakeItem]));

    db.$transaction.mockImplementation(async (cb: Function) => await cb(db));
    db.stockBalance.upsert.mockResolvedValue({
      id: 'bal', productId: PRODUCT_ID, locationId: SRC_LOC_ID, onHandQty: '100', reservedQty: '0',
    });
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
      .mockResolvedValueOnce(makeFakeRequest('DRAFT', [fakeItem]))
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
      .mockResolvedValueOnce(makeFakeRequest('DRAFT', [fakeItem]))
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
      .mockResolvedValueOnce(makeFakeRequest('DRAFT', [fakeItem]))
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
    // Verify decrement was called (source) and increment was called (destination)
    const updateCalls = db.stockBalance.update.mock.calls;
    expect(updateCalls).toHaveLength(2);
    // First call is decrement (source — qty should be negative or decrement op)
    const sourceDecrement = updateCalls[0][0].data;
    const destIncrement   = updateCalls[1][0].data;
    expect(sourceDecrement.onHandQty?.decrement || sourceDecrement.onHandQty?.increment).toBeDefined();
    expect(destIncrement.onHandQty?.increment).toBeDefined();
  });

  it('finalizes with multiple items — creates 2 ledger entries per item', async () => {
    const itemA = { ...fakeItem, id: 'item-a', qty: { toString: () => '5' } };
    const itemB = { ...fakeItem, id: 'item-b', productId: 'prod-b', qty: { toString: () => '3' } };

    db.stockTransferRequest.findUnique
      .mockResolvedValueOnce(makeFakeRequest('DRAFT', [itemA, itemB]))
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
// 10. CANNOT FINALIZE WITH NO ITEMS
// ===========================================================================

describe('Cannot finalize transfer with no items', () => {
  it('returns 400 when trying to finalize a DRAFT with no items', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', []));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no items/);
  });
});

// ===========================================================================
// 11. CANNOT FINALIZE ALREADY-FINALIZED REQUEST
// ===========================================================================

describe('Cannot finalize twice', () => {
  it('returns 400 when request is already FINALIZED', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Cannot finalize/);
  });
});

// ===========================================================================
// 12. CONCURRENCY FINALIZE PROTECTION
// ===========================================================================

describe('Concurrency — finalize protection', () => {
  it('returns 400 when updateMany claim returns count=0 (concurrent finalization)', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('DRAFT', [fakeItem]));
    // Simulate race: another process already finalized it
    db.stockTransferRequest.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post(`/v1/stock-transfers/${REQ_ID}/finalize`)
      .set(AUTH);

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 13. CANNOT ADD/EDIT/DELETE ITEMS ON FINALIZED REQUEST
// ===========================================================================

describe('Cannot modify items after finalization', () => {
  it('cannot add item to FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED'));

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

  it('cannot delete item on FINALIZED request', async () => {
    db.stockTransferRequest.findUnique.mockResolvedValue(makeFakeRequest('FINALIZED', [fakeItem]));

    const res = await request(app)
      .delete(`/v1/stock-transfers/${REQ_ID}/items/${ITEM_ID}`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/DRAFT/);
  });
});

// ===========================================================================
// 14. QTY VALIDATION
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
// 15. DATE FILTER VALIDATION
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
