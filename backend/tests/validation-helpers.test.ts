/**
 * Stage 8.1 — Validation Helpers Unit Tests
 *
 * Tests for validateLocationActive, validateUserAccess, validateProductActive.
 * Uses mocked Prisma — no live database required.
 * All helpers must return structured results and NEVER throw.
 */

import {
  validateLocationActive,
  validateUserAccess,
  validateProductActive,
  getRegisteredProductsAtLocation,
} from '../src/utils/validationHelpers';

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
    upsert:     jest.fn(),
  });

  return {
    __esModule: true,
    default: {
      location:        createMock(),
      userLocationRole: createMock(),
      productLocation: createMock(),
      $connect:    jest.fn(),
      $disconnect: jest.fn(),
      $transaction: jest.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const LOCATION_ID = 'loc-id-0001';
const USER_ID     = 'user-id-0001';
const PRODUCT_ID  = 'prod-id-0001';

let db: any;

beforeAll(async () => {
  db = (await import('../src/config/database')).default;
});

beforeEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// validateLocationActive
// ---------------------------------------------------------------------------
describe('validateLocationActive', () => {
  it('returns { valid: true } when location exists and is active', async () => {
    db.location.findUnique.mockResolvedValue({ id: LOCATION_ID, isActive: true });

    const result = await validateLocationActive(LOCATION_ID);

    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: false, reason: LOCATION_INACTIVE } when location is inactive', async () => {
    db.location.findUnique.mockResolvedValue({ id: LOCATION_ID, isActive: false });

    const result = await validateLocationActive(LOCATION_ID);

    expect(result).toEqual({ valid: false, reason: 'LOCATION_INACTIVE' });
  });

  it('returns { valid: false, reason: LOCATION_INACTIVE } when location does not exist', async () => {
    db.location.findUnique.mockResolvedValue(null);

    const result = await validateLocationActive(LOCATION_ID);

    expect(result).toEqual({ valid: false, reason: 'LOCATION_INACTIVE' });
  });

  it('returns { valid: false } and does NOT throw when prisma throws', async () => {
    db.location.findUnique.mockRejectedValue(new Error('DB error'));

    const result = await validateLocationActive(LOCATION_ID);

    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// validateUserAccess
// ---------------------------------------------------------------------------
describe('validateUserAccess', () => {
  it('returns { valid: true } when a UserLocationRole mapping exists', async () => {
    db.userLocationRole.findFirst.mockResolvedValue({
      id: 'role-id', userId: USER_ID, locationId: LOCATION_ID, role: 'MANAGER',
    });

    const result = await validateUserAccess(USER_ID, LOCATION_ID);

    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: false, reason: USER_NO_ACCESS_TO_LOCATION } when no mapping exists', async () => {
    db.userLocationRole.findFirst.mockResolvedValue(null);

    const result = await validateUserAccess(USER_ID, LOCATION_ID);

    expect(result).toEqual({ valid: false, reason: 'USER_NO_ACCESS_TO_LOCATION' });
  });

  it('returns { valid: false } and does NOT throw when prisma throws', async () => {
    db.userLocationRole.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await validateUserAccess(USER_ID, LOCATION_ID);

    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getRegisteredProductsAtLocation
// ---------------------------------------------------------------------------
describe('getRegisteredProductsAtLocation', () => {
  it('returns products when active mappings exist', async () => {
    const fakeProduct = { id: 'prod-1', sku: 'SKU-001', name: 'Widget' };
    db.productLocation.findMany.mockResolvedValue([
      { id: 'pl-1', productId: fakeProduct.id, locationId: LOCATION_ID, isActive: true, product: fakeProduct },
    ]);

    const result = await getRegisteredProductsAtLocation(LOCATION_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(fakeProduct);
  });

  it('returns empty array when no active mappings exist', async () => {
    db.productLocation.findMany.mockResolvedValue([]);

    const result = await getRegisteredProductsAtLocation(LOCATION_ID);

    expect(result).toEqual([]);
  });

  it('filters out null products (defensive)', async () => {
    db.productLocation.findMany.mockResolvedValue([
      { id: 'pl-2', product: null },
    ]);

    const result = await getRegisteredProductsAtLocation(LOCATION_ID);

    expect(result).toEqual([]);
  });

  it('returns empty array and does NOT throw when prisma throws', async () => {
    db.productLocation.findMany.mockRejectedValue(new Error('DB error'));

    const result = await getRegisteredProductsAtLocation(LOCATION_ID);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateProductActive
// ---------------------------------------------------------------------------
describe('validateProductActive', () => {
  it('returns { valid: true } when an active ProductLocation mapping exists', async () => {
    db.productLocation.findFirst.mockResolvedValue({
      id: 'pl-id', productId: PRODUCT_ID, locationId: LOCATION_ID, isActive: true,
    });

    const result = await validateProductActive(PRODUCT_ID, LOCATION_ID);

    expect(result).toEqual({ valid: true });
  });

  it('returns { valid: false, reason: PRODUCT_INACTIVE } when no active mapping exists', async () => {
    db.productLocation.findFirst.mockResolvedValue(null);

    const result = await validateProductActive(PRODUCT_ID, LOCATION_ID);

    // M1: missing row is treated identically to inactive
    expect(result).toEqual({ valid: false, reason: 'PRODUCT_INACTIVE' });
  });

  it('returns { valid: false } and does NOT throw when prisma throws', async () => {
    db.productLocation.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await validateProductActive(PRODUCT_ID, LOCATION_ID);

    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
