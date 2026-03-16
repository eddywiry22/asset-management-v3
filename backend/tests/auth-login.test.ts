import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app';

// ---------------------------------------------------------------------------
// Mock database — no live MySQL required for unit tests
// ---------------------------------------------------------------------------

const MOCK_USERS: Record<string, { id: string; email: string; phone: string; passwordHash: string; isActive: boolean }> = {
  'manager1@example.com': {
    id: 'test-manager1-id',
    email: 'manager1@example.com',
    phone: '+62811000001',
    passwordHash: '', // filled in beforeAll
    isActive: true,
  },
  'operator1@example.com': {
    id: 'test-operator1-id',
    email: 'operator1@example.com',
    phone: '+62822000001',
    passwordHash: '', // filled in beforeAll
    isActive: true,
  },
};

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  },
  connectDatabase: jest.fn(),
  disconnectDatabase: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lookupUser(identifier: string) {
  return (
    Object.values(MOCK_USERS).find(
      (u) => u.email === identifier || u.phone === identifier
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  const PASSWORD = 'password123';

  beforeAll(async () => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    Object.values(MOCK_USERS).forEach((u) => (u.passwordHash = hash));

    const db = (await import('../src/config/database')).default;
    (db.user.findFirst as jest.Mock).mockImplementation(
      async ({ where }: { where: { OR: Array<{ email?: string; phone?: string }> } }) => {
        const email = where.OR?.[0]?.email ?? '';
        const phone = where.OR?.[1]?.phone ?? '';
        return lookupUser(email) ?? lookupUser(phone) ?? null;
      }
    );
  });

  // -- manager1 (email + phone) -------------------------------------------

  it('manager1: returns 200 with tokens when logging in by email', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'manager1@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(res.body.data.user.email).toBe('manager1@example.com');
  });

  it('manager1: returns 200 with tokens when logging in by phone', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: '+62811000001',
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('access_token');
  });

  // -- operator1 (email + phone) ------------------------------------------

  it('operator1: returns 200 with tokens when logging in by email', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'operator1@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(res.body.data.user.email).toBe('operator1@example.com');
  });

  it('operator1: returns 200 with tokens when logging in by phone', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: '+62822000001',
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('access_token');
  });

  // -- rejection cases -------------------------------------------------------

  it('returns 401 when password is incorrect', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'manager1@example.com',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
  });

  it('returns 401 when user does not exist', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'unknown@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(401);
  });

  // -- validation cases ------------------------------------------------------

  it('returns 400 when identifier is missing', async () => {
    const res = await request(app).post('/auth/login').send({
      password: PASSWORD,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'manager1@example.com',
    });

    expect(res.status).toBe(400);
  });
});
