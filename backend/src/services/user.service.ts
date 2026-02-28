import prisma from '../lib/prisma.js';
import type { UpdateProfileInput } from '../schemas/user.schema.js';

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    googleId: user.googleId,
    publicInfo: user.publicInfo,
    friendsInfo: user.friendsInfo,
    privateInfo: user.privateInfo,
    musicPreferences: user.musicPreferences,
    isPremium: user.isPremium,
    createdAt: user.createdAt,
  };
}

export async function updateMe(userId: string, data: UpdateProfileInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    googleId: user.googleId,
    publicInfo: user.publicInfo,
    friendsInfo: user.friendsInfo,
    privateInfo: user.privateInfo,
    musicPreferences: user.musicPreferences,
  };
}

async function areFriends(userA: string, userB: string): Promise<boolean> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userId: userA, friendId: userB },
        { userId: userB, friendId: userA },
      ],
    },
  });
  return !!friendship;
}

export async function getUserProfile(targetUserId: string, requestingUserId: string) {
  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  // Self → show everything
  if (targetUserId === requestingUserId) {
    return {
      id: user.id,
      name: user.name,
      publicInfo: user.publicInfo,
      friendsInfo: user.friendsInfo,
      privateInfo: user.privateInfo,
      musicPreferences: user.musicPreferences,
    };
  }

  const friends = await areFriends(requestingUserId, targetUserId);

  return {
    id: user.id,
    name: user.name,
    publicInfo: user.publicInfo,
    friendsInfo: friends ? user.friendsInfo : undefined,
    // privateInfo is NEVER visible to others
    musicPreferences: user.musicPreferences,
  };
}

export async function sendFriendRequest(userId: string, friendId: string) {
  if (userId === friendId) {
    throw Object.assign(new Error('Cannot send friend request to yourself'), { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: friendId } });
  if (!target) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  // Check if a relationship already exists (both directions)
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    },
  });

  if (existing) {
    throw Object.assign(new Error('Friend request already exists'), { status: 409 });
  }

  const request = await prisma.friendship.create({
    data: { userId, friendId },
  });

  return request;
}

export async function acceptFriendRequest(userId: string, friendId: string) {
  // Find the request where friendId sent us a request
  const request = await prisma.friendship.findFirst({
    where: {
      userId: friendId,
      friendId: userId,
      status: 'PENDING',
    },
  });

  if (!request) {
    throw Object.assign(new Error('No pending friend request found'), { status: 404 });
  }

  const updated = await prisma.friendship.update({
    where: { id: request.id },
    data: { status: 'ACCEPTED' },
  });

  return updated;
}

export async function rejectFriendRequest(userId: string, friendId: string) {
  const request = await prisma.friendship.findFirst({
    where: {
      userId: friendId,
      friendId: userId,
      status: 'PENDING',
    },
  });

  if (!request) {
    throw Object.assign(new Error('No pending friend request found'), { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: request.id } });
}

export async function searchUsers(query: string, requestingUserId: string) {
  const users = await prisma.user.findMany({
    where: {
      id: { not: requestingUserId },
      OR: [
        { email: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, email: true },
    take: 20,
  });
  return users;
}

export async function getPendingRequests(userId: string) {
  const requests = await prisma.friendship.findMany({
    where: {
      friendId: userId,
      status: 'PENDING',
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return requests.map(r => ({ ...r.user, requestId: r.id }));
}

export async function removeFriend(userId: string, friendId: string) {
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    },
  });

  if (!friendship) {
    throw Object.assign(new Error('Friendship not found'), { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: friendship.id } });
}

export async function getFriends(userId: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ userId }, { friendId: userId }],
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      friend: { select: { id: true, name: true, email: true } },
    },
  });

  // Return the other person in each relationship
  return friendships.map(f =>
    f.userId === userId ? f.friend : f.user
  );
}

export async function toggleSubscription(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPremium: true },
  });

  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isPremium: !user.isPremium },
    select: { isPremium: true },
  });

  return updated;
}
