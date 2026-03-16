import request from 'supertest';
import app from '../src/app';

describe('Health Check', () => {
  it('GET /health should return status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
