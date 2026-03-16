/**
 * Master Data Module Tests — Stage 3 (corrected)
 *
 * Tests run against a mocked Prisma client (no live database required).
 * Covers: categories, vendors, UOMs, products.
 * Routes: /v1/admin/* with auth + admin middleware.
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
    count:      jest.fn(),
  });

  return {
    __esModule: true,
    default: {
      category: createMock(),
      vendor:   createMock(),
      uom:      createMock(),
      product:  createMock(),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $connect:    jest.fn(),
      $disconnect: jest.fn(),
    },
    connectDatabase:    jest.fn(),
    disconnectDatabase: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AUTH = { Authorization: 'Bearer valid.token.here' };

const CATEGORY_ID = '11111111-1111-4111-a111-111111111111';
const VENDOR_ID   = '22222222-2222-4222-a222-222222222222';
const UOM_ID      = '33333333-3333-4333-a333-333333333333';
const PRODUCT_ID  = '44444444-4444-4444-a444-444444444444';

const fakeCategory = {
  id: CATEGORY_ID, name: 'Electronics', isActive: true,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const fakeVendor = {
  id: VENDOR_ID, name: 'Tech Supplier Ltd', contactInfo: 'contact@tech.com', isActive: true,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const fakeUom = { id: UOM_ID, code: 'PCS', name: 'Pieces' };

const fakeProduct = {
  id: PRODUCT_ID, sku: 'ELEC-001', name: 'Laptop',
  categoryId: CATEGORY_ID, vendorId: VENDOR_ID, uomId: UOM_ID,
  isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  category: { id: CATEGORY_ID, name: 'Electronics' },
  vendor:   { id: VENDOR_ID,   name: 'Tech Supplier Ltd' },
  uom:      { id: UOM_ID, code: 'PCS', name: 'Pieces' },
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
// ADMIN ROLE ENFORCEMENT
// ===========================================================================

describe('Admin role enforcement', () => {
  it('returns 403 when isAdmin is false', async () => {
    const { authService } = await import('../src/modules/auth/auth.service');
    (authService.verifyAccessToken as jest.Mock).mockReturnValueOnce({
      sub:     'user-operator-id',
      email:   'operator@example.com',
      phone:   null,
      isAdmin: false,
    });

    const res = await request(app).get('/v1/admin/categories').set(AUTH);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBeDefined();
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/v1/admin/categories');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ===========================================================================
// CATEGORY TESTS
// ===========================================================================

describe('Categories', () => {
  describe('GET /v1/admin/categories', () => {
    it('returns paginated list of categories', async () => {
      db.category.findMany.mockResolvedValue([fakeCategory]);
      db.category.count.mockResolvedValue(1);

      const res = await request(app).get('/v1/admin/categories').set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Electronics');
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBe(1);
      expect(res.body.meta.page).toBe(1);
    });
  });

  describe('POST /v1/admin/categories', () => {
    it('creates a new category successfully', async () => {
      db.category.findUnique.mockResolvedValue(null);
      db.category.create.mockResolvedValue(fakeCategory);

      const res = await request(app)
        .post('/v1/admin/categories')
        .set(AUTH)
        .send({ name: 'Electronics' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Electronics');
      expect(db.category.create).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate category name', async () => {
      db.category.findUnique.mockResolvedValue(fakeCategory);

      const res = await request(app)
        .post('/v1/admin/categories')
        .set(AUTH)
        .send({ name: 'Electronics' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBeDefined();
      expect(db.category.create).not.toHaveBeenCalled();
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/v1/admin/categories')
        .set(AUTH)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /v1/admin/categories/:id', () => {
    it('updates a category successfully', async () => {
      const updated = { ...fakeCategory, name: 'Consumer Electronics' };
      db.category.findUnique
        .mockResolvedValueOnce(fakeCategory)
        .mockResolvedValueOnce(null);
      db.category.update.mockResolvedValue(updated);

      const res = await request(app)
        .put(`/v1/admin/categories/${CATEGORY_ID}`)
        .set(AUTH)
        .send({ name: 'Consumer Electronics' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Consumer Electronics');
    });

    it('returns 404 when category does not exist', async () => {
      db.category.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put(`/v1/admin/categories/nonexistent-id`)
        .set(AUTH)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});

// ===========================================================================
// VENDOR TESTS
// ===========================================================================

describe('Vendors', () => {
  describe('GET /v1/admin/vendors', () => {
    it('returns paginated list of vendors', async () => {
      db.vendor.findMany.mockResolvedValue([fakeVendor]);
      db.vendor.count.mockResolvedValue(1);

      const res = await request(app).get('/v1/admin/vendors').set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Tech Supplier Ltd');
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('POST /v1/admin/vendors', () => {
    it('creates a vendor successfully', async () => {
      db.vendor.create.mockResolvedValue(fakeVendor);

      const res = await request(app)
        .post('/v1/admin/vendors')
        .set(AUTH)
        .send({ name: 'Tech Supplier Ltd', contactInfo: 'contact@tech.com' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Tech Supplier Ltd');
      expect(db.vendor.create).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when contactInfo is missing', async () => {
      const res = await request(app)
        .post('/v1/admin/vendors')
        .set(AUTH)
        .send({ name: 'Tech Supplier Ltd' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /v1/admin/vendors/:id', () => {
    it('updates a vendor', async () => {
      const updated = { ...fakeVendor, contactInfo: 'new@tech.com' };
      db.vendor.findUnique.mockResolvedValue(fakeVendor);
      db.vendor.update.mockResolvedValue(updated);

      const res = await request(app)
        .put(`/v1/admin/vendors/${VENDOR_ID}`)
        .set(AUTH)
        .send({ contactInfo: 'new@tech.com' });

      expect(res.status).toBe(200);
      expect(res.body.data.contactInfo).toBe('new@tech.com');
    });
  });
});

// ===========================================================================
// UOM TESTS
// ===========================================================================

describe('UOMs', () => {
  describe('GET /v1/admin/uoms', () => {
    it('returns paginated list of UOMs', async () => {
      db.uom.findMany.mockResolvedValue([fakeUom]);
      db.uom.count.mockResolvedValue(1);

      const res = await request(app).get('/v1/admin/uoms').set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].code).toBe('PCS');
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('POST /v1/admin/uoms', () => {
    it('creates a UOM successfully', async () => {
      db.uom.findUnique.mockResolvedValue(null);
      db.uom.create.mockResolvedValue(fakeUom);

      const res = await request(app)
        .post('/v1/admin/uoms')
        .set(AUTH)
        .send({ code: 'PCS', name: 'Pieces' });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('PCS');
      expect(db.uom.create).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate UOM code', async () => {
      db.uom.findUnique.mockResolvedValue(fakeUom);

      const res = await request(app)
        .post('/v1/admin/uoms')
        .set(AUTH)
        .send({ code: 'PCS', name: 'Pieces' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(db.uom.create).not.toHaveBeenCalled();
    });

    it('returns 400 when code is missing', async () => {
      const res = await request(app)
        .post('/v1/admin/uoms')
        .set(AUTH)
        .send({ name: 'Pieces' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

// ===========================================================================
// PRODUCT TESTS
// ===========================================================================

describe('Products', () => {
  describe('GET /v1/admin/products', () => {
    it('returns paginated list of products', async () => {
      db.product.findMany.mockResolvedValue([fakeProduct]);
      db.product.count.mockResolvedValue(1);

      const res = await request(app).get('/v1/admin/products').set(AUTH);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].sku).toBe('ELEC-001');
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('POST /v1/admin/products', () => {
    it('creates a product successfully', async () => {
      db.product.findUnique.mockResolvedValue(null);
      db.category.findUnique.mockResolvedValue(fakeCategory);
      db.vendor.findUnique.mockResolvedValue(fakeVendor);
      db.uom.findUnique.mockResolvedValue(fakeUom);
      db.product.create.mockResolvedValue(fakeProduct);

      const res = await request(app)
        .post('/v1/admin/products')
        .set(AUTH)
        .send({
          sku:        'ELEC-001',
          name:       'Laptop',
          categoryId: CATEGORY_ID,
          vendorId:   VENDOR_ID,
          uomId:      UOM_ID,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.sku).toBe('ELEC-001');
      expect(db.product.create).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate SKU', async () => {
      db.product.findUnique.mockResolvedValue(fakeProduct);

      const res = await request(app)
        .post('/v1/admin/products')
        .set(AUTH)
        .send({
          sku:        'ELEC-001',
          name:       'Laptop',
          categoryId: CATEGORY_ID,
          vendorId:   VENDOR_ID,
          uomId:      UOM_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(db.product.create).not.toHaveBeenCalled();
    });

    it('rejects invalid category FK (service-layer check)', async () => {
      db.product.findUnique.mockResolvedValue(null);      // SKU not taken
      db.category.findUnique.mockResolvedValue(null);     // category not found

      const res = await request(app)
        .post('/v1/admin/products')
        .set(AUTH)
        .send({
          sku:        'ELEC-NEW',
          name:       'New Product',
          categoryId: CATEGORY_ID,   // valid UUID → passes Zod
          vendorId:   VENDOR_ID,
          uomId:      UOM_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(db.product.create).not.toHaveBeenCalled();
    });

    it('rejects invalid vendor FK (service-layer check)', async () => {
      db.product.findUnique.mockResolvedValue(null);
      db.category.findUnique.mockResolvedValue(fakeCategory);
      db.vendor.findUnique.mockResolvedValue(null);       // vendor not found

      const res = await request(app)
        .post('/v1/admin/products')
        .set(AUTH)
        .send({
          sku:        'ELEC-NEW',
          name:       'New Product',
          categoryId: CATEGORY_ID,
          vendorId:   VENDOR_ID,     // valid UUID → passes Zod
          uomId:      UOM_ID,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(db.product.create).not.toHaveBeenCalled();
    });

    it('rejects invalid UOM FK (service-layer check)', async () => {
      db.product.findUnique.mockResolvedValue(null);
      db.category.findUnique.mockResolvedValue(fakeCategory);
      db.vendor.findUnique.mockResolvedValue(fakeVendor);
      db.uom.findUnique.mockResolvedValue(null);          // UOM not found

      const res = await request(app)
        .post('/v1/admin/products')
        .set(AUTH)
        .send({
          sku:        'ELEC-NEW',
          name:       'New Product',
          categoryId: CATEGORY_ID,
          vendorId:   VENDOR_ID,
          uomId:      UOM_ID,        // valid UUID → passes Zod
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(db.product.create).not.toHaveBeenCalled();
    });

    it('returns 400 when SKU is missing', async () => {
      const res = await request(app)
        .post('/v1/admin/products')
        .set(AUTH)
        .send({ name: 'Laptop', categoryId: CATEGORY_ID, vendorId: VENDOR_ID, uomId: UOM_ID });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /v1/admin/products/:id', () => {
    it('deactivates a product', async () => {
      const updated = { ...fakeProduct, isActive: false };
      db.product.findUnique.mockResolvedValue(fakeProduct);
      db.product.update.mockResolvedValue(updated);

      const res = await request(app)
        .put(`/v1/admin/products/${PRODUCT_ID}`)
        .set(AUTH)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });

    it('returns 404 when product not found', async () => {
      db.product.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put(`/v1/admin/products/nonexistent-id`)
        .set(AUTH)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
