import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../lib/prisma.js';

const ts = Date.now();
const userA = { email: `user-a-${ts}@test.com`, password: 'Password123!', name: 'User A' };
const userB = { email: `user-b-${ts}@test.com`, password: 'Password123!', name: 'User B' };

let tokenA: string;
let tokenB: string;
let userAId: string;
let userBId: string;

beforeAll(async () => {
  await prisma.friendship.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });

  // Create both users and retrieve their tokens
  const resA = await request(app).post('/api/auth/register').send(userA);
  tokenA = resA.body.data.accessToken;
  userAId = resA.body.data.user.id;

  const resB = await request(app).post('/api/auth/register').send(userB);
  tokenB = resB.body.data.accessToken;
  userBId = resB.body.data.user.id;
});

afterAll(async () => {
  await prisma.friendship.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
  await prisma.$disconnect();
});

describe('GET /api/users/me', () => {
  it('should return my profile', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(userA.email);
    expect(res.body.data.name).toBe(userA.name);
  });

  it('should reject without token', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/users/me', () => {
  it('should update profile fields', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        publicInfo: 'Fan de jazz',
        friendsInfo: 'Dispo le samedi',
        privateInfo: 'Mon journal secret',
        musicPreferences: ['jazz', 'rock'],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.publicInfo).toBe('Fan de jazz');
    expect(res.body.data.friendsInfo).toBe('Dispo le samedi');
    expect(res.body.data.privateInfo).toBe('Mon journal secret');
    expect(res.body.data.musicPreferences).toEqual(['jazz', 'rock']);
  });

  // Also fill in B for visibility tests
  it('should update user B profile', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        publicInfo: 'Public de B',
        friendsInfo: 'Friends-only de B',
        privateInfo: 'Private de B',
      });

    expect(res.status).toBe(200);
  });
});

describe('Visibility rules — GET /api/users/:id', () => {
  it('should see own full profile', async () => {
    const res = await request(app)
      .get(`/api/users/${userAId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.publicInfo).toBe('Fan de jazz');
    expect(res.body.data.friendsInfo).toBe('Dispo le samedi');
    expect(res.body.data.privateInfo).toBe('Mon journal secret');
  });

  it('non-friend should see only publicInfo', async () => {
    const res = await request(app)
      .get(`/api/users/${userAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.data.publicInfo).toBe('Fan de jazz');
    expect(res.body.data.friendsInfo).toBeUndefined();
    expect(res.body.data.privateInfo).toBeUndefined();
  });
});

describe('Friend system', () => {
  it('should send a friend request', async () => {
    const res = await request(app)
      .post(`/api/users/friend-requests/${userBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('should reject duplicate request', async () => {
    const res = await request(app)
      .post(`/api/users/friend-requests/${userBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(409);
  });

  it('should reject self friend request', async () => {
    const res = await request(app)
      .post(`/api/users/friend-requests/${userAId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(400);
  });

  it('non-friend should still NOT see friendsInfo before accepting', async () => {
    const res = await request(app)
      .get(`/api/users/${userAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.body.data.friendsInfo).toBeUndefined();
  });

  it('should accept friend request', async () => {
    const res = await request(app)
      .put(`/api/users/friend-requests/${userAId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACCEPTED');
  });

  it('friend should NOW see friendsInfo', async () => {
    const res = await request(app)
      .get(`/api/users/${userAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.data.publicInfo).toBe('Fan de jazz');
    expect(res.body.data.friendsInfo).toBe('Dispo le samedi');
    // privateInfo must NEVER be visible to another user
    expect(res.body.data.privateInfo).toBeUndefined();
  });

  it('friend should also see friendsInfo in reverse direction', async () => {
    const res = await request(app)
      .get(`/api/users/${userBId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.publicInfo).toBe('Public de B');
    expect(res.body.data.friendsInfo).toBe('Friends-only de B');
    expect(res.body.data.privateInfo).toBeUndefined();
  });

  it('should list friends', async () => {
    const res = await request(app)
      .get('/api/users/me/friends')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe(userB.email);
  });
});
