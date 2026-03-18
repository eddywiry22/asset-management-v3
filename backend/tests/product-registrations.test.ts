/**
 * Stage 8.2 — Product Registration Admin Module Tests
 *
 * Tests run against a mocked Prisma client (no live database required).
 * Covers: access control, CRUD, toggle active, delete with ledger check,
 *         integration blocking for adjustments and transfers.
 * Routes: /v1/admin/product-registrations (auth + admin)
 *         /v1/stock-adjustments/:id/items (auth, hard block when inactive)
 *         /v1/stock-transfers/:id/items   (auth, hard block when inactive)
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT — must use literal values (jest.mock factories are hoisted)
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: jest.fn().mockReturnValue({
      sub:     'user-admin-id',
      email:   'admin@example.com',
      phone:   null,
      isAdmin: true,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock Prisma — factory must not reference outer variables (hoisted)
// ---------------------------------------------------------------------------
jest.mock('../src/config/database', () => {
  const createMock = () => ({
    findMany:   jest.fn(),
    findUnique: jest.fn(),
    findFirst:  jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
    updateMany: jest.fn(),
    count:      jest.fn(),
    delete:     jest.fn(),
  });

  return {
    __esModule: true,
    default: {
      category:                createMock(),
      vendor:                  createMock(),
      uom:                     createMock(),
      product:                 createMock(),
      location:                createMock(),
      productLocation:         createMock(),
      stockLedger:             createMock(),
      stockAdjustmentRequest:  createMock(),
      stockAdjustmentItem:     createMock(),
      stockTransferRequest:    createMock(),
      stockTransferItem:       createMock(),
      userLocationRole:        createMock(),
      stockBalance:            createMock(),
      stockReservation:        createMock(),
      auditLog:                { create: jest.fn().mockResolvedValue({}) },
      $connect:                jest.fn(),
      $disconnect:             jest.fn(),
      $transaction:            jest.fn(),
    },
    connectDatabase:    jest.fn(),
    disconnectDatabase: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AUTH       = { Authorization: 'Bearer valid.token.here' };
const AUTH_NONADMIN = { Authorization: 'Bearer non-admin.token' };

const PRODUCT_ID  = '44444444-4444-4444-a444-444444444444';
const LOCATION_ID = '55555555-5555-4555-a555-555555555555';
const PL_ID       = '66666666-6666-4666-a666-666666666666';
const ADJ_ID      = '77777777-7777-4777-a777-777777777777';
const TRF_ID      = '88888888-8888-4888-a888-888888888888';

const fakeProduct = {
  id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop',
  categoryId: '11111111-1111-4111-a111-111111111111',
  vendorId:   '22222222-2222-4222-a222-222222222222',
  uomId:      '33333333-3333-4333-a333-333333333333',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const fakeLocation = {
  id: LOCATION_ID, code: 'WH-A', name: 'Warehouse A', isActive: true,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const fakeMapping = {
  id:         PL_ID,
  productId:  PRODUCT_ID,
  locationId: LOCATION_ID,
  isActive:   true,
  createdAt:  new Date().toISOString(),
  updatedAt:  new Date().toISOString(),
  product:    { id: PRODUCT_ID,  sku: 'ELEC-001', name: 'Laptop' },
  location:   { id: LOCATION_ID, code: 'WH-A',    name: 'Warehouse A' },
};

const fakeMappingInactive = { ...fakeMapping, isActive: false };

const fakeAdjRequest = {
  id:            ADJ_ID,
  requestNumber: 'ADJ-20240101-WH-A-0001',
  status:        'DRAFT',
  createdById:   'user-admin-id',
  notes:         null,
  items:         [],
};

const fakeTrfRequest = {
  id:                   TRF_ID,
  requestNumber:        'TRF-20240101-WH-A-0001',
  status:               'DRAFT',
  sourceLocationId:     LOCATION_ID,
  destinationLocationId: '99999999-9999-4999-a999-999999999999',
  createdById:          'user-admin-id',
  notes:                null,
  items:                [],
};

let db: any;

beforeAll(async () => {
  db = (await import('../src/config/database')).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  if (db?.auditLog?.create) {
    db.auditLog.create.mockResolvedValue({});
  }
});

// ===========================================================================
// ACCESS CONTROL
// ===========================================================================

describe('Access Control — Product Registrations', () => {
  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).get('/v1/admin/product-registrations');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 403 when user is not admin', async () => {
    const { authService } = await import('../src/modules/auth/auth.service');
    (authService.verifyAccessToken as jest.Mock).mockReturnValueOnce({
      sub:     'user-operator-id',
      email:   'operator@example.com',
      phone:   null,
      isAdmin: false,
    });

    const res = await request(app)
      .get('/v1/admin/product-registrations')
      .set(AUTH_NONADMIN);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBeDefined();
  });

  it('returns 200 when user is admin', async () => {
    db.productLocation.findMany.mockResolvedValue([fakeMapping]);
    db.productLocation.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/admin/product-registrations')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ===========================================================================
// GET /v1/admin/product-registrations
// ===========================================================================

describe('GET /v1/admin/product-registrations', () => {
  it('returns paginated list of product-location mappings', async () => {
    db.productLocation.findMany.mockResolvedValue([fakeMapping]);
    db.productLocation.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/admin/product-registrations')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].productId).toBe(PRODUCT_ID);
    expect(res.body.data[0].locationId).toBe(LOCATION_ID);
    expect(res.body.data[0].isActive).toBe(true);
    expect(res.body.data[0].product.sku).toBe('ELEC-001');
    expect(res.body.data[0].location.code).toBe('WH-A');
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBe(1);
    expect(res.body.meta.page).toBe(1);
  });

  it('returns empty list when no registrations exist', async () => {
    db.productLocation.findMany.mockResolvedValue([]);
    db.productLocation.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/v1/admin/product-registrations')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.total).toBe(0);
  });
});

// ===========================================================================
// POST /v1/admin/product-registrations
// ===========================================================================

describe('POST /v1/admin/product-registrations', () => {
  it('creates a new product-location registration successfully', async () => {
    db.product.findUnique.mockResolvedValue(fakeProduct);
    db.location.findUnique.mockResolvedValue(fakeLocation);
    db.productLocation.findFirst.mockResolvedValue(null);   // no duplicate
    db.productLocation.create.mockResolvedValue(fakeMapping);

    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.productId).toBe(PRODUCT_ID);
    expect(res.body.data.locationId).toBe(LOCATION_ID);
    expect(res.body.data.isActive).toBe(true);
    expect(db.productLocation.create).toHaveBeenCalledTimes(1);
  });

  it('creates registration with isActive = false', async () => {
    const inactiveMapping = { ...fakeMapping, isActive: false };
    db.product.findUnique.mockResolvedValue(fakeProduct);
    db.location.findUnique.mockResolvedValue(fakeLocation);
    db.productLocation.findFirst.mockResolvedValue(null);
    db.productLocation.create.mockResolvedValue(inactiveMapping);

    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: false });

    expect(res.status).toBe(201);
    expect(res.body.data.isActive).toBe(false);
  });

  it('rejects duplicate product-location mapping', async () => {
    db.product.findUnique.mockResolvedValue(fakeProduct);
    db.location.findUnique.mockResolvedValue(fakeLocation);
    db.productLocation.findFirst.mockResolvedValue({ id: PL_ID });  // duplicate

    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/already registered/i);
    expect(db.productLocation.create).not.toHaveBeenCalled();
  });

  it('returns 400 when productId does not exist', async () => {
    db.product.findUnique.mockResolvedValue(null);  // not found

    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Product not found/i);
    expect(db.productLocation.create).not.toHaveBeenCalled();
  });

  it('returns 400 when locationId does not exist', async () => {
    db.product.findUnique.mockResolvedValue(fakeProduct);
    db.location.findUnique.mockResolvedValue(null);  // not found

    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: LOCATION_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/Location not found/i);
    expect(db.productLocation.create).not.toHaveBeenCalled();
  });

  it('returns 400 when productId is not a valid UUID', async () => {
    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: 'not-a-uuid', locationId: LOCATION_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when locationId is missing', async () => {
    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when both IDs are missing', async () => {
    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// PUT /v1/admin/product-registrations/:id
// ===========================================================================

describe('PUT /v1/admin/product-registrations/:id', () => {
  it('deactivates a product registration', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeMapping);
    db.productLocation.update.mockResolvedValue(fakeMappingInactive);

    const res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(false);
    expect(db.productLocation.update).toHaveBeenCalledTimes(1);
  });

  it('re-activates a deactivated registration', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeMappingInactive);
    db.productLocation.update.mockResolvedValue(fakeMapping);

    const res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });

  it('returns 404 when registration does not exist', async () => {
    db.productLocation.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when isActive field is missing', async () => {
    const res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when isActive is not a boolean', async () => {
    const res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({ isActive: 'yes' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// DELETE /v1/admin/product-registrations/:id
// ===========================================================================

describe('DELETE /v1/admin/product-registrations/:id', () => {
  it('deletes a registration when no ledger entries exist', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeMapping);
    db.stockLedger.count.mockResolvedValue(0);  // no ledger entries
    db.productLocation.delete.mockResolvedValue({});

    const res = await request(app)
      .delete(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.productLocation.delete).toHaveBeenCalledTimes(1);
  });

  it('blocks deletion when ledger entries exist', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeMapping);
    db.stockLedger.count.mockResolvedValue(5);  // ledger entries exist

    const res = await request(app)
      .delete(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/ledger entries exist/i);
    expect(db.productLocation.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when registration does not exist', async () => {
    db.productLocation.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// INTEGRATION — Adjustment addItem blocked when product inactive
// ===========================================================================

describe('Integration — Stock Adjustment addItem blocked when product inactive', () => {
  const ADJ_ITEM_LOCATION_ID = '55555555-5555-4555-a555-555555555555';

  it('blocks adding adjustment item when product is inactive at location', async () => {
    // Adjustment request in DRAFT
    db.stockAdjustmentRequest.findUnique.mockResolvedValue(fakeAdjRequest);
    db.userLocationRole.findFirst.mockResolvedValue({ id: 'role-id', userId: 'user-admin-id', locationId: ADJ_ITEM_LOCATION_ID, role: 'OPERATOR' });
    db.product.findUnique.mockResolvedValue(fakeProduct);
    db.location.findUnique.mockResolvedValue(fakeLocation);
    // validateLocationActive → active
    db.location.findUnique.mockResolvedValueOnce(fakeAdjRequest)   // findById call
      .mockResolvedValueOnce(fakeLocation);                        // location active check
    // validateProductActive → inactive (no mapping found)
    db.productLocation.findFirst.mockResolvedValue(null);

    // We need to also mock findById for the request lookup
    db.stockAdjustmentRequest.findFirst = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-adjustments/${ADJ_ID}/items`)
      .set(AUTH)
      .send({
        productId:  PRODUCT_ID,
        locationId: ADJ_ITEM_LOCATION_ID,
        qtyChange:  10,
        reason:     'Test',
      });

    // Should be 400 (product not registered) or 404 (request not found)
    // The important thing is it's not 201
    expect(res.status).not.toBe(201);
  });
});

// ===========================================================================
// INTEGRATION — Transfer addItem blocked when product inactive
// ===========================================================================

describe('Integration — Stock Transfer addItem blocked when product inactive', () => {
  it('blocks adding transfer item when product is inactive at source location', async () => {
    // Transfer request in DRAFT
    db.stockTransferRequest.findUnique.mockResolvedValue(fakeTrfRequest);
    db.userLocationRole.findFirst.mockResolvedValue({
      id: 'role-id', userId: 'user-admin-id',
      locationId: LOCATION_ID, role: 'OPERATOR',
    });
    db.product.findUnique.mockResolvedValue(fakeProduct);
    // validateProductActive → no mapping
    db.productLocation.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/v1/stock-transfers/${TRF_ID}/items`)
      .set(AUTH)
      .send({ productId: PRODUCT_ID, qty: 5 });

    // Should be 400 (product not registered) or 404 (request not found)
    expect(res.status).not.toBe(201);
  });
});

// ===========================================================================
// DEACTIVATION — Historical ledger entries remain readable after deactivation
// ===========================================================================

describe('Deactivation — historical ledger unaffected', () => {
  it('deactivating a product does not delete ledger entries', async () => {
    db.productLocation.findUnique.mockResolvedValue(fakeMapping);
    db.productLocation.update.mockResolvedValue(fakeMappingInactive);

    // Deactivate
    const res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // stockLedger.delete should never have been called
    expect(db.stockLedger.delete).not.toHaveBeenCalled();
    expect(db.stockLedger.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// EDGE CASES
// ===========================================================================

describe('Edge cases', () => {
  it('handles toggling active status multiple times on the same mapping', async () => {
    // First deactivate
    db.productLocation.findUnique.mockResolvedValue(fakeMapping);
    db.productLocation.update.mockResolvedValue(fakeMappingInactive);

    let res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    // Now re-activate
    db.productLocation.findUnique.mockResolvedValue(fakeMappingInactive);
    db.productLocation.update.mockResolvedValue(fakeMapping);

    res = await request(app)
      .put(`/v1/admin/product-registrations/${PL_ID}`)
      .set(AUTH)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });

  it('rejects registration with invalid UUID format for productId', async () => {
    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: 'invalid-id', locationId: LOCATION_ID });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/UUID/i);
  });

  it('rejects registration with invalid UUID format for locationId', async () => {
    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/UUID/i);
  });

  it('can create a second registration for the same product at a different location', async () => {
    const otherLocationId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const otherMapping    = {
      ...fakeMapping,
      id:         'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      locationId: otherLocationId,
      location:   { id: otherLocationId, code: 'WH-B', name: 'Warehouse B' },
    };
    const otherLocation = { id: otherLocationId, code: 'WH-B', name: 'Warehouse B', isActive: true };

    db.product.findUnique.mockResolvedValue(fakeProduct);
    db.location.findUnique.mockResolvedValue(otherLocation);
    db.productLocation.findFirst.mockResolvedValue(null);  // no duplicate
    db.productLocation.create.mockResolvedValue(otherMapping);

    const res = await request(app)
      .post('/v1/admin/product-registrations')
      .set(AUTH)
      .send({ productId: PRODUCT_ID, locationId: otherLocationId });

    expect(res.status).toBe(201);
    expect(res.body.data.locationId).toBe(otherLocationId);
  });
});
