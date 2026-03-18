/**
 * Admin User Management Tests — Stage 8.5
 *
 * Tests run against a mocked Prisma client (no live database required).
 * Covers: CRUD, role enforcement, toggle active, location assignment.
 */

import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock JWT — admin user (verifyAccessToken only; login is kept real)
// ---------------------------------------------------------------------------
jest.mock('../src/modules/auth/auth.service', () => {
  // Keep the real AuthService class for login
  const { AuthService } = jest.requireActual('../src/modules/auth/auth.service');
  const realInstance = new AuthService();
  return {
    authService: {
      login: realInstance.login.bind(realInstance),
      verifyAccessToken: jest.fn().mockReturnValue({
        sub: 'admin-user-id',
        email: 'admin@example.com',
        phone: null,
        isAdmin: true,
      }),
      generateAccessToken: jest.fn().mockReturnValue('mock.access.token'),
      generateRefreshToken: jest.fn().mockReturnValue('mock.refresh.token'),
    },
  };
});

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const LOC_ID  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

let mockPasswordHash = '';

const fakeLocation = {
  id: LOC_ID,
  code: 'WH-01',
  name: 'Warehouse 1',
  address: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeUserWithRoles = () => ({
  id: USER_ID,
  username: 'operator1',
  email: 'operator1@example.com',
  phone: null,
  passwordHash: mockPasswordHash,
  isActive: true,
  isAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  locationRoles: [
    {
      id: 'lr-1',
      userId: USER_ID,
      locationId: LOC_ID,
      role: 'OPERATOR',
      location: fakeLocation,
    },
  ],
});

const fakeUserPlain = () => ({
  id: USER_ID,
  username: 'operator1',
  email: 'operator1@example.com',
  phone: null,
  passwordHash: mockPasswordHash,
  isActive: true,
  isAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

jest.mock('../src/config/database', () => {
  return {
    __esModule: true,
    default: {
      user: {
        findMany:   jest.fn(),
        findUnique: jest.fn(),
        findFirst:  jest.fn(),
        create:     jest.fn(),
        update:     jest.fn(),
      },
      location: {
        findMany:   jest.fn(),
        findUnique: jest.fn(),
      },
      userLocationRole: {
        deleteMany:  jest.fn(),
        createMany:  jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
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

async function getDb() {
  return (await import('../src/config/database')).default;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(async () => {
  mockPasswordHash = await bcrypt.hash('password123', 10);
});

beforeEach(async () => {
  jest.clearAllMocks();
  const db = await getDb();

  // Default: findUnique returns full user with location roles
  (db.user.findUnique as jest.Mock).mockResolvedValue(fakeUserWithRoles());
  // Default: findMany returns list of users with location roles
  (db.user.findMany as jest.Mock).mockResolvedValue([fakeUserWithRoles()]);
  // Default: findFirst returns null (no user found — for uniqueness checks)
  (db.user.findFirst as jest.Mock).mockResolvedValue(null);
  // Default: create returns plain user
  (db.user.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
    ...fakeUserPlain(),
    ...data,
  }));
  // Default: update returns updated user
  (db.user.update as jest.Mock).mockImplementation(async ({ data }: any) => ({
    ...fakeUserPlain(),
    ...data,
  }));
  // Default: location lookup (for validateLocationsExist)
  (db.location.findMany as jest.Mock).mockResolvedValue([{ id: LOC_ID }]);
  // Default: $transaction executes all operations
  (db.$transaction as jest.Mock).mockImplementation(async (ops: any[]) => {
    return Promise.all(ops);
  });
  // Keep auditLog.create as no-op
  (db.auditLog.create as jest.Mock).mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// GET /v1/admin/users
// ---------------------------------------------------------------------------
describe('GET /v1/admin/users', () => {
  it('returns 200 with list of users', async () => {
    const res = await request(app)
      .get('/v1/admin/users')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toHaveProperty('username', 'operator1');
    expect(res.body.data[0]).toHaveProperty('assignedLocations');
  });

  it('passes status=ACTIVE filter to query', async () => {
    const db = await getDb();
    const res = await request(app)
      .get('/v1/admin/users?status=ACTIVE')
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/v1/admin/users');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/users
// ---------------------------------------------------------------------------
describe('POST /v1/admin/users', () => {
  const validPayload = {
    username: 'newoperator',
    email: 'newoperator@example.com',
    password: 'password123',
    role: 'OPERATOR',
    locationIds: [LOC_ID],
  };

  it('creates a user and returns 201', async () => {
    const db = await getDb();

    // Uniqueness checks: no existing user
    (db.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)  // findByEmail check
      .mockResolvedValueOnce(null)  // findByUsername check
      // After creation, findById (with include) is called for the response
      .mockResolvedValue({
        ...fakeUserWithRoles(),
        username: 'newoperator',
        email: 'newoperator@example.com',
      });

    const res = await request(app)
      .post('/v1/admin/users')
      .set(AUTH)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(db.user.create).toHaveBeenCalled();
  });

  it('returns 400 when role is admin', async () => {
    const res = await request(app)
      .post('/v1/admin/users')
      .set(AUTH)
      .send({ ...validPayload, role: 'ADMIN' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when username is missing', async () => {
    const { username: _u, ...payload } = validPayload;
    const res = await request(app)
      .post('/v1/admin/users')
      .set(AUTH)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/v1/admin/users')
      .set(AUTH)
      .send({ ...validPayload, password: 'abc' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when email is already in use', async () => {
    const db = await getDb();
    // findByEmail returns existing user
    (db.user.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where.email === validPayload.email) return fakeUserPlain();
      return null;
    });

    const res = await request(app)
      .post('/v1/admin/users')
      .set(AUTH)
      .send(validPayload);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/already in use/i);
  });

  it('returns 400 when username is already in use', async () => {
    const db = await getDb();
    (db.user.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where.username === validPayload.username) return fakeUserPlain();
      return null;
    });

    const res = await request(app)
      .post('/v1/admin/users')
      .set(AUTH)
      .send(validPayload);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/already in use/i);
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/admin/users/:id
// ---------------------------------------------------------------------------
describe('PUT /v1/admin/users/:id', () => {
  it('updates user and returns 200', async () => {
    const db = await getDb();
    // findById → findUnique (includes locationRoles), then uniqueness checks, then update, then findById again
    (db.user.findUnique as jest.Mock).mockResolvedValue(fakeUserWithRoles());

    const res = await request(app)
      .put(`/v1/admin/users/${USER_ID}`)
      .set(AUTH)
      .send({ username: 'updated_operator', locationIds: [LOC_ID] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when attempting to set admin role', async () => {
    const res = await request(app)
      .put(`/v1/admin/users/${USER_ID}`)
      .set(AUTH)
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when user does not exist', async () => {
    const db = await getDb();
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .put(`/v1/admin/users/${USER_ID}`)
      .set(AUTH)
      .send({ username: 'whatever' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/admin/users/:id/toggle-active
// ---------------------------------------------------------------------------
describe('PATCH /v1/admin/users/:id/toggle-active', () => {
  it('toggles user to inactive and returns 200', async () => {
    const db = await getDb();
    const inactiveUserWithRoles = { ...fakeUserWithRoles(), isActive: false };

    // First findById call (check current state) → active
    // After update, second findById call → inactive
    (db.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(fakeUserWithRoles())
      .mockResolvedValue(inactiveUserWithRoles);

    (db.user.update as jest.Mock).mockResolvedValue({ ...fakeUserPlain(), isActive: false });

    const res = await request(app)
      .patch(`/v1/admin/users/${USER_ID}/toggle-active`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(false);
  });

  it('returns 404 when user does not exist', async () => {
    const db = await getDb();
    (db.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .patch(`/v1/admin/users/nonexistent-id/toggle-active`)
      .set(AUTH);

    expect(res.status).toBe(404);
  });

  it('writes an audit log on toggle', async () => {
    const db = await getDb();
    const inactiveUserWithRoles = { ...fakeUserWithRoles(), isActive: false };

    (db.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(fakeUserWithRoles())
      .mockResolvedValue(inactiveUserWithRoles);
    (db.user.update as jest.Mock).mockResolvedValue({ ...fakeUserPlain(), isActive: false });

    await request(app)
      .patch(`/v1/admin/users/${USER_ID}/toggle-active`)
      .set(AUTH);

    await new Promise((r) => setTimeout(r, 50));
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          entityType: 'USER',
          entityId: USER_ID,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Auth — inactive user login
// ---------------------------------------------------------------------------
describe('POST /v1/auth/login — inactive user', () => {
  let inactiveUserHash = '';

  beforeAll(async () => {
    inactiveUserHash = await bcrypt.hash('password123', 10);
  });

  beforeEach(async () => {
    const db = await getDb();
    (db.user.findFirst as jest.Mock).mockImplementation(async ({ where }: any) => {
      const email = where?.OR?.[0]?.email ?? '';
      if (email === 'inactive@example.com') {
        return {
          id: 'inactive-user-id',
          username: 'inactive_user',
          email: 'inactive@example.com',
          phone: null,
          passwordHash: inactiveUserHash,
          isActive: false,
          isAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return null;
    });
  });

  it('returns 401 with descriptive message for inactive user', async () => {
    const res = await request(app).post('/v1/auth/login').send({
      identifier: 'inactive@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/inactive/i);
    expect(res.body.error.message).toMatch(/contact admin/i);
  });
});
