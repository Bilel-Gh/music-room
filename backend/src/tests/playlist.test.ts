import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import prisma from '../lib/prisma.js';

const ts = Date.now();
const owner = { email: `pl-owner-${ts}@test.com`, password: 'password123', name: 'Owner' };
const editor = { email: `pl-editor-${ts}@test.com`, password: 'password123', name: 'Editor' };
const viewer = { email: `pl-viewer-${ts}@test.com`, password: 'password123', name: 'Viewer' };
const stranger = { email: `pl-stranger-${ts}@test.com`, password: 'password123', name: 'Stranger' };

let ownerToken: string;
let editorToken: string;
let viewerToken: string;
let strangerToken: string;
let editorId: string;
let viewerId: string;

let playlistId: string;
let invitePlaylistId: string;
let trackAId: string;
let trackBId: string;
let trackCId: string;

beforeAll(async () => {
  await prisma.playlistTrack.deleteMany({});
  await prisma.playlistMember.deleteMany({});
  await prisma.playlist.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [owner.email, editor.email, viewer.email, stranger.email] } },
  });

  const resOwner = await request(app).post('/api/auth/register').send(owner);
  ownerToken = resOwner.body.data.accessToken;

  const resEditor = await request(app).post('/api/auth/register').send(editor);
  editorToken = resEditor.body.data.accessToken;
  editorId = resEditor.body.data.user.id;

  const resViewer = await request(app).post('/api/auth/register').send(viewer);
  viewerToken = resViewer.body.data.accessToken;
  viewerId = resViewer.body.data.user.id;

  const resStranger = await request(app).post('/api/auth/register').send(stranger);
  strangerToken = resStranger.body.data.accessToken;
});

afterAll(async () => {
  await prisma.playlistTrack.deleteMany({});
  await prisma.playlistMember.deleteMany({});
  await prisma.playlist.deleteMany({});
  await prisma.user.deleteMany({
    where: { email: { in: [owner.email, editor.email, viewer.email, stranger.email] } },
  });
  await prisma.$disconnect();
});

describe('CRUD /api/playlists', () => {
  it('should create an OPEN playlist', async () => {
    const res = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Chill Vibes', description: 'Relaxing tracks' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Chill Vibes');
    expect(res.body.data.licenseType).toBe('OPEN');
    playlistId = res.body.data.id;
  });

  it('should create an INVITE_ONLY playlist', async () => {
    const res = await request(app)
      .post('/api/playlists')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Private Mix', licenseType: 'INVITE_ONLY', isPublic: false });

    expect(res.status).toBe(201);
    expect(res.body.data.licenseType).toBe('INVITE_ONLY');
    invitePlaylistId = res.body.data.id;
  });

  it('should list public playlists', async () => {
    const res = await request(app)
      .get('/api/playlists')
      .set('Authorization', `Bearer ${strangerToken}`);

    expect(res.status).toBe(200);
    // only "Chill Vibes" is public
    const names = res.body.data.map((p: { name: string }) => p.name);
    expect(names).toContain('Chill Vibes');
    expect(names).not.toContain('Private Mix');
  });

  it('should get playlist details', async () => {
    const res = await request(app)
      .get(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.creator.name).toBe('Owner');
  });

  it('should update playlist (creator only)', async () => {
    const res = await request(app)
      .put(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Chill Vibes v2' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Chill Vibes v2');
  });

  it('should reject update by non-creator', async () => {
    const res = await request(app)
      .put(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ name: 'Hack' });

    expect(res.status).toBe(403);
  });

  it('stranger should NOT see private playlist', async () => {
    const res = await request(app)
      .get(`/api/playlists/${invitePlaylistId}`)
      .set('Authorization', `Bearer ${strangerToken}`);

    expect(res.status).toBe(404);
  });
});

describe('Invite members', () => {
  it('should invite editor with canEdit=true', async () => {
    const res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: editorId, canEdit: true });

    expect(res.status).toBe(201);
    expect(res.body.data.canEdit).toBe(true);
  });

  it('should invite viewer with canEdit=false', async () => {
    const res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: viewerId, canEdit: false });

    expect(res.status).toBe(201);
    expect(res.body.data.canEdit).toBe(false);
  });

  it('should reject duplicate invite', async () => {
    const res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: editorId });

    expect(res.status).toBe(409);
  });

  it('non-creator should NOT invite', async () => {
    const res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/invite`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ userId: viewerId });

    expect(res.status).toBe(403);
  });
});

describe('Tracks — add, list, permissions', () => {
  it('anyone can add track on OPEN playlist', async () => {
    const res = await request(app)
      .post(`/api/playlists/${playlistId}/tracks`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ title: 'Open Track', artist: 'Open Artist' });

    expect(res.status).toBe(201);
    expect(res.body.data.position).toBe(0);
  });

  it('editor can add track on INVITE_ONLY playlist', async () => {
    const res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/tracks`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Track A', artist: 'Artist A' });

    expect(res.status).toBe(201);
    expect(res.body.data.position).toBe(0);
    trackAId = res.body.data.id;
  });

  it('should auto-increment position', async () => {
    let res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/tracks`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Track B', artist: 'Artist B' });
    expect(res.body.data.position).toBe(1);
    trackBId = res.body.data.id;

    res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/tracks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Track C', artist: 'Artist C' });
    expect(res.body.data.position).toBe(2);
    trackCId = res.body.data.id;
  });

  it('viewer (canEdit=false) should NOT add tracks', async () => {
    const res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/tracks`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'No', artist: 'No' });

    expect(res.status).toBe(403);
  });

  it('stranger should NOT add tracks on INVITE_ONLY', async () => {
    const res = await request(app)
      .post(`/api/playlists/${invitePlaylistId}/tracks`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ title: 'No', artist: 'No' });

    expect(res.status).toBe(403);
  });

  it('should list tracks sorted by position', async () => {
    const res = await request(app)
      .get(`/api/playlists/${invitePlaylistId}/tracks`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].title).toBe('Track A');
    expect(res.body.data[1].title).toBe('Track B');
    expect(res.body.data[2].title).toBe('Track C');
  });
});

describe('Reorder tracks', () => {
  // Initial state: A(0), B(1), C(2)

  it('should move C from position 2 to 0', async () => {
    const res = await request(app)
      .put(`/api/playlists/${invitePlaylistId}/tracks/${trackCId}/position`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ newPosition: 0 });

    expect(res.status).toBe(200);
    const titles = res.body.data.map((t: { title: string }) => t.title);
    // Expected: C(0), A(1), B(2)
    expect(titles).toEqual(['Track C', 'Track A', 'Track B']);
  });

  it('should move C from position 0 back to 2', async () => {
    const res = await request(app)
      .put(`/api/playlists/${invitePlaylistId}/tracks/${trackCId}/position`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ newPosition: 2 });

    expect(res.status).toBe(200);
    const titles = res.body.data.map((t: { title: string }) => t.title);
    // Expected: A(0), B(1), C(2)
    expect(titles).toEqual(['Track A', 'Track B', 'Track C']);
  });

  it('should move A from position 0 to 1 (swap middle)', async () => {
    const res = await request(app)
      .put(`/api/playlists/${invitePlaylistId}/tracks/${trackAId}/position`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ newPosition: 1 });

    expect(res.status).toBe(200);
    const titles = res.body.data.map((t: { title: string }) => t.title);
    // Expected: B(0), A(1), C(2)
    expect(titles).toEqual(['Track B', 'Track A', 'Track C']);
  });

  it('viewer should NOT reorder', async () => {
    const res = await request(app)
      .put(`/api/playlists/${invitePlaylistId}/tracks/${trackAId}/position`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ newPosition: 0 });

    expect(res.status).toBe(403);
  });
});

describe('Remove tracks', () => {
  it('should remove middle track and reindex', async () => {
    // State: B(0), A(1), C(2) — removing A
    const res = await request(app)
      .delete(`/api/playlists/${invitePlaylistId}/tracks/${trackAId}`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(204);

    // Verify positions
    const listRes = await request(app)
      .get(`/api/playlists/${invitePlaylistId}/tracks`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(listRes.body.data).toHaveLength(2);
    expect(listRes.body.data[0].title).toBe('Track B');
    expect(listRes.body.data[0].position).toBe(0);
    expect(listRes.body.data[1].title).toBe('Track C');
    expect(listRes.body.data[1].position).toBe(1);
  });

  it('viewer should NOT remove tracks', async () => {
    const res = await request(app)
      .delete(`/api/playlists/${invitePlaylistId}/tracks/${trackBId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Delete playlist', () => {
  it('non-creator should NOT delete', async () => {
    const res = await request(app)
      .delete(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${strangerToken}`);

    expect(res.status).toBe(403);
  });

  it('creator should delete (cascade)', async () => {
    const res = await request(app)
      .delete(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);
  });

  it('deleted playlist should return 404', async () => {
    const res = await request(app)
      .get(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});
