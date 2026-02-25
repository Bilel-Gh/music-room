import prisma from '../lib/prisma.js';
import type {
  CreatePlaylistInput,
  UpdatePlaylistInput,
  AddPlaylistTrackInput,
  InviteUserInput,
} from '../schemas/playlist.schema.js';

// Vérifie si l'utilisateur peut voir la playlist
async function assertCanView(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) {
    throw Object.assign(new Error('Playlist not found'), { status: 404 });
  }

  // Publique → tout le monde peut voir
  if (playlist.isPublic) return playlist;

  // Privée → seulement les membres
  const member = await prisma.playlistMember.findUnique({
    where: { playlistId_userId: { playlistId, userId } },
  });
  if (!member) {
    throw Object.assign(new Error('Playlist not found'), { status: 404 });
  }

  return playlist;
}

// Vérifie si l'utilisateur peut modifier la playlist (ajouter/supprimer/réordonner)
async function assertCanEdit(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) {
    throw Object.assign(new Error('Playlist not found'), { status: 404 });
  }

  // OPEN → tout le monde peut éditer
  if (playlist.licenseType === 'OPEN') return playlist;

  // INVITE_ONLY → il faut être membre avec canEdit = true
  const member = await prisma.playlistMember.findUnique({
    where: { playlistId_userId: { playlistId, userId } },
  });
  if (!member || !member.canEdit) {
    throw Object.assign(new Error('You do not have edit access'), { status: 403 });
  }

  return playlist;
}

export async function createPlaylist(data: CreatePlaylistInput, userId: string) {
  return prisma.playlist.create({
    data: {
      ...data,
      creatorId: userId,
      members: {
        create: { userId, canEdit: true },
      },
    },
  });
}

export async function getPlaylist(playlistId: string, userId: string) {
  await assertCanView(playlistId, userId);

  return prisma.playlist.findUnique({
    where: { id: playlistId },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { members: true, tracks: true } },
    },
  });
}

export async function listPlaylists() {
  return prisma.playlist.findMany({
    where: { isPublic: true },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { members: true, tracks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updatePlaylist(playlistId: string, userId: string, data: UpdatePlaylistInput) {
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) {
    throw Object.assign(new Error('Playlist not found'), { status: 404 });
  }
  if (playlist.creatorId !== userId) {
    throw Object.assign(new Error('Only the creator can update this playlist'), { status: 403 });
  }

  return prisma.playlist.update({ where: { id: playlistId }, data });
}

export async function deletePlaylist(playlistId: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) {
    throw Object.assign(new Error('Playlist not found'), { status: 404 });
  }
  if (playlist.creatorId !== userId) {
    throw Object.assign(new Error('Only the creator can delete this playlist'), { status: 403 });
  }

  await prisma.playlist.delete({ where: { id: playlistId } });
}

export async function addTrack(playlistId: string, data: AddPlaylistTrackInput, userId: string) {
  await assertCanEdit(playlistId, userId);

  // Trouver la position max actuelle dans une transaction
  return prisma.$transaction(async (tx) => {
    const lastTrack = await tx.playlistTrack.findFirst({
      where: { playlistId },
      orderBy: { position: 'desc' },
    });
    const nextPosition = lastTrack ? lastTrack.position + 1 : 0;

    return tx.playlistTrack.create({
      data: {
        ...data,
        playlistId,
        addedById: userId,
        position: nextPosition,
      },
    });
  });
}

export async function removeTrack(playlistId: string, trackId: string, userId: string) {
  await assertCanEdit(playlistId, userId);

  return prisma.$transaction(async (tx) => {
    const track = await tx.playlistTrack.findUnique({ where: { id: trackId } });
    if (!track || track.playlistId !== playlistId) {
      throw Object.assign(new Error('Track not found in this playlist'), { status: 404 });
    }

    await tx.playlistTrack.delete({ where: { id: trackId } });

    // Décaler toutes les tracks après celle supprimée
    await tx.playlistTrack.updateMany({
      where: { playlistId, position: { gt: track.position } },
      data: { position: { decrement: 1 } },
    });
  });
}

export async function reorderTrack(
  playlistId: string,
  trackId: string,
  newPosition: number,
  userId: string,
) {
  await assertCanEdit(playlistId, userId);

  return prisma.$transaction(async (tx) => {
    const track = await tx.playlistTrack.findUnique({ where: { id: trackId } });
    if (!track || track.playlistId !== playlistId) {
      throw Object.assign(new Error('Track not found in this playlist'), { status: 404 });
    }

    const oldPosition = track.position;
    if (oldPosition === newPosition) return;

    const trackCount = await tx.playlistTrack.count({ where: { playlistId } });
    const clampedNew = Math.min(newPosition, trackCount - 1);

    if (oldPosition < clampedNew) {
      // Déplacement vers le bas : décaler les tracks entre [old+1, new] vers le haut
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gt: oldPosition, lte: clampedNew },
        },
        data: { position: { decrement: 1 } },
      });
    } else {
      // Déplacement vers le haut : décaler les tracks entre [new, old-1] vers le bas
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gte: clampedNew, lt: oldPosition },
        },
        data: { position: { increment: 1 } },
      });
    }

    await tx.playlistTrack.update({
      where: { id: trackId },
      data: { position: clampedNew },
    });
  });
}

export async function inviteUser(playlistId: string, userId: string, data: InviteUserInput) {
  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) {
    throw Object.assign(new Error('Playlist not found'), { status: 404 });
  }
  if (playlist.creatorId !== userId) {
    throw Object.assign(new Error('Only the creator can invite users'), { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!target) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const existing = await prisma.playlistMember.findUnique({
    where: { playlistId_userId: { playlistId, userId: data.userId } },
  });
  if (existing) {
    throw Object.assign(new Error('User is already a member'), { status: 409 });
  }

  return prisma.playlistMember.create({
    data: {
      playlistId,
      userId: data.userId,
      canEdit: data.canEdit ?? true,
    },
  });
}

export async function getPlaylistTracks(playlistId: string, userId: string) {
  await assertCanView(playlistId, userId);

  return prisma.playlistTrack.findMany({
    where: { playlistId },
    include: {
      addedBy: { select: { id: true, name: true } },
    },
    orderBy: { position: 'asc' },
  });
}
