import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app';

// Mock PrismaClient so tests run without a database
jest.mock('../src/config/database', () => {
  const mockUser = {
    id: 'test-user-id-1',
    email: 'manager@example.com',
    phone: '+6281234567890',
    passwordHash: '',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    __esModule: true,
    default: {
      user: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { OR: Array<{ email?: string; phone?: string }> } }) => {
          const identifier = where.OR?.[0]?.email ?? where.OR?.[1]?.phone ?? '';
          if (identifier === mockUser.email || identifier === mockUser.phone) {
            return mockUser;
          }
          return null;
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    },
    connectDatabase: jest.fn(),
    disconnectDatabase: jest.fn(),
  };
});

describe('POST /auth/login', () => {
  const PASSWORD = 'password123';
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(PASSWORD, 10);

    // Inject the real hash into the mock user
    const db = (await import('../src/config/database')).default;
    (db.user.findFirst as jest.Mock).mockImplementation(
      async ({ where }: { where: { OR: Array<{ email?: string; phone?: string }> } }) => {
        const identifier = where.OR?.[0]?.email ?? where.OR?.[1]?.phone ?? '';
        if (identifier === 'manager@example.com' || identifier === '+6281234567890') {
          return {
            id: 'test-user-id-1',
            email: 'manager@example.com',
            phone: '+6281234567890',
            passwordHash: hashedPassword,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      }
    );
  });

  it('returns 200 with tokens when credentials are valid (email)', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'manager@example.com',
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(res.body.data.user.email).toBe('manager@example.com');
  });

  it('returns 200 with tokens when credentials are valid (phone)', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: '+6281234567890',
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('access_token');
  });

  it('returns 401 when password is incorrect', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'manager@example.com',
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

  it('returns 400 when identifier is missing', async () => {
    const res = await request(app).post('/auth/login').send({
      password: PASSWORD,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/auth/login').send({
      identifier: 'manager@example.com',
    });

    expect(res.status).toBe(400);
  });
});
