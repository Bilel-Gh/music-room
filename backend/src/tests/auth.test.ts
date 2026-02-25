import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../lib/prisma.js';

const testEmail = `test-${Date.now()}@example.com`;
const testUser = {
  email: testEmail,
  password: 'password123',
  name: 'Test User',
};

let refreshToken: string;
let accessToken: string;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: testEmail } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    accessToken = res.body.data.accessToken;
  });

  it('should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should reject invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bad', password: '123', name: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });
});

describe('POST /api/auth/login', () => {
  it('should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();

    refreshToken = res.body.data.refreshToken;
  });

  it('should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should reject non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope@nope.com', password: 'whatever123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('should return new tokens with valid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('should reject invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'garbage-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/verify-email', () => {
  it('should verify email with correct code', async () => {
    // Récupérer le code depuis la BDD
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    const code = user!.verificationCode!;

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: testEmail, code });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject wrong code', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ email: testEmail, code: '000000' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/forgot-password + reset-password', () => {
  it('should accept forgot-password request', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testEmail });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reset password with valid token', async () => {
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    const token = user!.resetToken!;

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'newpassword456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should login with new password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'newpassword456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should reject invalid reset token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'fake-token', password: 'whatever123' });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/auth/link-google', () => {
  it('should reject without auth token', async () => {
    const res = await request(app)
      .put('/api/auth/link-google')
      .send({ googleId: 'google-123' });

    expect(res.status).toBe(401);
  });

  it('should link google to authenticated user', async () => {
    // Re-login pour avoir un token frais
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'newpassword456' });

    const token = loginRes.body.data.accessToken;

    const res = await request(app)
      .put('/api/auth/link-google')
      .set('Authorization', `Bearer ${token}`)
      .send({ googleId: 'google-test-123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.googleId).toBe('google-test-123');
  });
});
