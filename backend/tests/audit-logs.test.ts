/**
 * Audit Log Module — Stage 8.3 Tests
 *
 * Covers:
 *  - Admin-only access enforcement (non-admin receives 403)
 *  - Paginated results with correct meta
 *  - Filter by entityType, action, userId, dateStart/dateEnd
 *  - Full beforeSnapshot / afterSnapshot included in response
 *  - Logs only created for successful operations
 */

import request from 'supertest';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT — switch between admin and non-admin per test
// ---------------------------------------------------------------------------
const mockVerify = jest.fn();

jest.mock('../src/modules/auth/auth.service', () => ({
  authService: {
    verifyAccessToken: (...args: any[]) => mockVerify(...args),
  },
}));

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const mockAuditLog = {
  findMany: jest.fn(),
  count:    jest.fn(),
  create:   jest.fn().mockResolvedValue({}),
};

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    auditLog:         {
      findMany: (...args: any[]) => mockAuditLog.findMany(...args),
      count:    (...args: any[]) => mockAuditLog.count(...args),
      create:   (...args: any[]) => mockAuditLog.create(...args),
    },
    $connect:    jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn(),
  },
  connectDatabase:    jest.fn(),
  disconnectDatabase: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ADMIN_AUTH    = { Authorization: 'Bearer admin.token' };
const NON_ADMIN_AUTH = { Authorization: 'Bearer user.token' };

const ADMIN_USER = {
  sub:     'admin-user-id',
  email:   'admin@example.com',
  phone:   null,
  isAdmin: true,
};

const NON_ADMIN_USER = {
  sub:     'regular-user-id',
  email:   'user@example.com',
  phone:   null,
  isAdmin: false,
};

const SAMPLE_LOG = {
  id:             'log-id-1',
  userId:         'admin-user-id',
  action:         'CREATE',
  entityType:     'PRODUCT',
  entityId:       'product-id-1',
  timestamp:      new Date('2024-03-14T10:00:00Z'),
  beforeSnapshot: null,
  afterSnapshot:  { id: 'product-id-1', sku: 'SKU-001', name: 'Widget A' },
  warnings:       null,
  user:           { id: 'admin-user-id', email: 'admin@example.com', phone: null },
};

const SAMPLE_LOG_2 = {
  id:             'log-id-2',
  userId:         'admin-user-id',
  action:         'STATUS_CHANGE',
  entityType:     'STOCK_ADJUSTMENT_REQUEST',
  entityId:       'adj-req-id-1',
  timestamp:      new Date('2024-03-14T11:00:00Z'),
  beforeSnapshot: { status: 'DRAFT' },
  afterSnapshot:  { status: 'SUBMITTED' },
  warnings:       [{ type: 'INACTIVE_PRODUCT', productId: 'p-001' }],
  user:           { id: 'admin-user-id', email: 'admin@example.com', phone: null },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /v1/admin/audit-logs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerify.mockReturnValue(ADMIN_USER);
    mockAuditLog.findMany.mockResolvedValue([SAMPLE_LOG]);
    mockAuditLog.count.mockResolvedValue(1);
  });

  // -------------------------------------------------------------------------
  // Auth & access control
  // -------------------------------------------------------------------------
  it('returns 401 when no token provided', async () => {
    const res = await request(app).get('/v1/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin users', async () => {
    mockVerify.mockReturnValue(NON_ADMIN_USER);
    const res = await request(app)
      .get('/v1/admin/audit-logs')
      .set(NON_ADMIN_AUTH);
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin users', async () => {
    const res = await request(app)
      .get('/v1/admin/audit-logs')
      .set(ADMIN_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Pagination meta
  // -------------------------------------------------------------------------
  it('returns paginated results with correct meta', async () => {
    mockAuditLog.findMany.mockResolvedValue([SAMPLE_LOG, SAMPLE_LOG_2]);
    mockAuditLog.count.mockResolvedValue(42);

    const res = await request(app)
      .get('/v1/admin/audit-logs?page=2&limit=10')
      .set(ADMIN_AUTH);

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 42, page: 2, limit: 10 });
    expect(res.body.data).toHaveLength(2);
  });

  it('defaults to page=1 limit=20 when not specified', async () => {
    mockAuditLog.findMany.mockResolvedValue([SAMPLE_LOG]);
    mockAuditLog.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/admin/audit-logs')
      .set(ADMIN_AUTH);

    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  // -------------------------------------------------------------------------
  // Response shape — includes full snapshots
  // -------------------------------------------------------------------------
  it('includes beforeSnapshot and afterSnapshot in response', async () => {
    mockAuditLog.findMany.mockResolvedValue([SAMPLE_LOG_2]);
    mockAuditLog.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/admin/audit-logs')
      .set(ADMIN_AUTH);

    expect(res.status).toBe(200);
    const log = res.body.data[0];
    expect(log.beforeSnapshot).toEqual({ status: 'DRAFT' });
    expect(log.afterSnapshot).toEqual({ status: 'SUBMITTED' });
  });

  it('includes warnings in response', async () => {
    mockAuditLog.findMany.mockResolvedValue([SAMPLE_LOG_2]);
    mockAuditLog.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/admin/audit-logs')
      .set(ADMIN_AUTH);

    const log = res.body.data[0];
    expect(log.warnings).toEqual([{ type: 'INACTIVE_PRODUCT', productId: 'p-001' }]);
  });

  it('includes user info in response', async () => {
    mockAuditLog.findMany.mockResolvedValue([SAMPLE_LOG]);
    mockAuditLog.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/v1/admin/audit-logs')
      .set(ADMIN_AUTH);

    const log = res.body.data[0];
    expect(log.user).toMatchObject({ id: 'admin-user-id', email: 'admin@example.com' });
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------
  it('passes entityType filter to repository query', async () => {
    mockAuditLog.findMany.mockResolvedValue([]);
    mockAuditLog.count.mockResolvedValue(0);

    await request(app)
      .get('/v1/admin/audit-logs?entityType=PRODUCT')
      .set(ADMIN_AUTH);

    const callArgs = mockAuditLog.findMany.mock.calls[0][0];
    expect(callArgs.where.entityType).toBe('PRODUCT');
  });

  it('passes action filter to repository query', async () => {
    mockAuditLog.findMany.mockResolvedValue([]);
    mockAuditLog.count.mockResolvedValue(0);

    await request(app)
      .get('/v1/admin/audit-logs?action=CREATE')
      .set(ADMIN_AUTH);

    const callArgs = mockAuditLog.findMany.mock.calls[0][0];
    expect(callArgs.where.action).toBe('CREATE');
  });

  it('passes userId filter to repository query', async () => {
    mockAuditLog.findMany.mockResolvedValue([]);
    mockAuditLog.count.mockResolvedValue(0);

    await request(app)
      .get('/v1/admin/audit-logs?userId=some-user-id')
      .set(ADMIN_AUTH);

    const callArgs = mockAuditLog.findMany.mock.calls[0][0];
    expect(callArgs.where.userId).toBe('some-user-id');
  });

  it('applies dateStart and dateEnd filters', async () => {
    mockAuditLog.findMany.mockResolvedValue([]);
    mockAuditLog.count.mockResolvedValue(0);

    await request(app)
      .get('/v1/admin/audit-logs?dateStart=2024-03-01T00:00:00Z&dateEnd=2024-03-31T23:59:59Z')
      .set(ADMIN_AUTH);

    const callArgs = mockAuditLog.findMany.mock.calls[0][0];
    expect(callArgs.where.timestamp).toBeDefined();
    expect(callArgs.where.timestamp.gte).toEqual(new Date('2024-03-01T00:00:00Z'));
    expect(callArgs.where.timestamp.lte).toEqual(new Date('2024-03-31T23:59:59Z'));
  });

  it('returns empty data array when no logs match', async () => {
    mockAuditLog.findMany.mockResolvedValue([]);
    mockAuditLog.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/v1/admin/audit-logs?entityType=USER')
      .set(ADMIN_AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Audit service — logs only on successful operations
  // -------------------------------------------------------------------------
  it('audit log create is called with correct fields', async () => {
    // Directly test auditService.log writes the new field names
    const { auditService } = await import('../src/services/audit.service');
    await auditService.log({
      userId:         'test-user-id',
      action:         'CREATE',
      entityType:     'PRODUCT',
      entityId:       'prod-id-1',
      beforeSnapshot: null,
      afterSnapshot:  { sku: 'TEST-SKU' },
      warnings:       [{ msg: 'test warning' }],
    });

    expect(mockAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId:     'test-user-id',
        action:     'CREATE',
        entityType: 'PRODUCT',
        entityId:   'prod-id-1',
        afterSnapshot: { sku: 'TEST-SKU' },
        warnings:   [{ msg: 'test warning' }],
      }),
    });
  });

  it('audit service does not throw if db write fails', async () => {
    mockAuditLog.create.mockRejectedValueOnce(new Error('DB error'));
    const { auditService } = await import('../src/services/audit.service');
    // Should not throw — fire and forget pattern
    await expect(auditService.log({
      userId:     'test-user-id',
      action:     'CREATE',
      entityType: 'PRODUCT',
      entityId:   'prod-id-1',
    })).resolves.toBeUndefined();
  });
});
