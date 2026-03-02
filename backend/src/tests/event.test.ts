import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../lib/prisma.js';

const ts = Date.now();
const creator = { email: `event-creator-${ts}@test.com`, password: 'password123', name: 'Creator' };
const voter = { email: `event-voter-${ts}@test.com`, password: 'password123', name: 'Voter' };
const outsider = { email: `event-outsider-${ts}@test.com`, password: 'password123', name: 'Outsider' };

let creatorToken: string;
let voterToken: string;
let outsiderToken: string;
let eventId: string;
let trackId: string;
let inviteEventId: string;

beforeAll(async () => {
  // Cleanup
  await prisma.vote.deleteMany({});
  await prisma.track.deleteMany({});
  await prisma.eventMember.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [creator.email, voter.email, outsider.email] } },
  });

  const resCreator = await request(app).post('/api/auth/register').send(creator);
  creatorToken = resCreator.body.data.accessToken;

  const resVoter = await request(app).post('/api/auth/register').send(voter);
  voterToken = resVoter.body.data.accessToken;

  const resOutsider = await request(app).post('/api/auth/register').send(outsider);
  outsiderToken = resOutsider.body.data.accessToken;
});

afterAll(async () => {
  await prisma.vote.deleteMany({});
  await prisma.track.deleteMany({});
  await prisma.eventMember.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [creator.email, voter.email, outsider.email] } },
  });
  await prisma.$disconnect();
});

describe('CRUD /api/events', () => {
  it('should create an event', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: 'Soiree Jazz', description: 'Une soiree chill' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Soiree Jazz');
    expect(res.body.data.licenseType).toBe('OPEN');
    eventId = res.body.data.id;
  });

  it('should create an invite-only event', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: 'VIP Party', licenseType: 'INVITE_ONLY' });

    expect(res.status).toBe(201);
    expect(res.body.data.licenseType).toBe('INVITE_ONLY');
    inviteEventId = res.body.data.id;
  });

  it('should list public events', async () => {
    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${voterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('should get event details', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Soiree Jazz');
    expect(res.body.data.creator.name).toBe('Creator');
  });

  it('should update event (creator only)', async () => {
    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ name: 'Soiree Jazz & Blues' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Soiree Jazz & Blues');
  });

  it('should reject update by non-creator', async () => {
    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${voterToken}`)
      .send({ name: 'Hack' });

    expect(res.status).toBe(403);
  });
});

describe('Join events', () => {
  it('should join an OPEN event', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${voterToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('PARTICIPANT');
  });

  it('should reject duplicate join', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/join`)
      .set('Authorization', `Bearer ${voterToken}`);

    expect(res.status).toBe(409);
  });

  it('should reject joining an INVITE_ONLY event', async () => {
    const res = await request(app)
      .post(`/api/events/${inviteEventId}/join`)
      .set('Authorization', `Bearer ${voterToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Tracks', () => {
  it('should add a track to an OPEN event', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/tracks`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ title: 'So What', artist: 'Miles Davis' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('So What');
    expect(res.body.data.voteCount).toBe(0);
    trackId = res.body.data.id;
  });

  it('should add a second track', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/tracks`)
      .set('Authorization', `Bearer ${voterToken}`)
      .send({ title: 'Take Five', artist: 'Dave Brubeck' });

    expect(res.status).toBe(201);
  });

  it('should reject adding track to INVITE_ONLY event if not member', async () => {
    const res = await request(app)
      .post(`/api/events/${inviteEventId}/tracks`)
      .set('Authorization', `Bearer ${voterToken}`)
      .send({ title: 'Test', artist: 'Test' });

    expect(res.status).toBe(403);
  });

  it('should list tracks sorted by votes', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/tracks`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });
});

describe('Voting', () => {
  it('should vote for a track', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/tracks/${trackId}/vote`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.voteCount).toBe(1);
  });

  it('should reject double vote', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/tracks/${trackId}/vote`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it('should allow a different user to vote', async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/tracks/${trackId}/vote`)
      .set('Authorization', `Bearer ${voterToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.voteCount).toBe(2);
  });

  it('should reject vote on INVITE_ONLY event if not member', async () => {
    // First add a track with the creator on the invite-only event
    const trackRes = await request(app)
      .post(`/api/events/${inviteEventId}/tracks`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ title: 'VIP Track', artist: 'VIP Artist' });

    const vipTrackId = trackRes.body.data.id;

    const res = await request(app)
      .post(`/api/events/${inviteEventId}/tracks/${vipTrackId}/vote`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('tracks should be sorted by vote count', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/tracks`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(200);
    const tracks = res.body.data;
    // "So What" has 2 votes, "Take Five" has 0
    expect(tracks[0].title).toBe('So What');
    expect(tracks[0].voteCount).toBe(2);
    expect(tracks[1].voteCount).toBe(0);
  });
});

describe('Delete event', () => {
  it('should reject delete by non-creator', async () => {
    const res = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${voterToken}`);

    expect(res.status).toBe(403);
  });

  it('should delete event (cascade tracks, votes, members)', async () => {
    const res = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(204);
  });

  it('deleted event should return 404', async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${creatorToken}`);

    expect(res.status).toBe(404);
  });
});
