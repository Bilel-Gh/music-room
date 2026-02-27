import prisma from '../lib/prisma.js';
import type { CreateEventInput, UpdateEventInput, AddTrackInput } from '../schemas/event.schema.js';

export async function createEvent(data: CreateEventInput, userId: string) {
  const event = await prisma.event.create({
    data: {
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : null,
      endTime: data.endTime ? new Date(data.endTime) : null,
      creatorId: userId,
      members: {
        create: { userId, role: 'CREATOR' },
      },
    },
  });

  return event;
}

export async function getEvent(eventId: string, userId?: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { members: true, tracks: true } },
    },
  });

  if (!event) {
    throw Object.assign(new Error('Event not found'), { status: 404 });
  }

  let membership = null;
  if (userId) {
    const member = await prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (member) {
      membership = { role: member.role };
    }
  }

  return { ...event, membership };
}

export async function listEvents() {
  return prisma.event.findMany({
    where: { isPublic: true },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { members: true, tracks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMyEvents(userId: string) {
  return prisma.event.findMany({
    where: {
      members: { some: { userId, role: { not: 'INVITED' } } },
    },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { members: true, tracks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listPendingInvitations(userId: string) {
  const memberships = await prisma.eventMember.findMany({
    where: { userId, role: 'INVITED' },
    include: {
      event: {
        include: {
          creator: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });

  return memberships.map(m => ({
    invitationId: m.id,
    event: m.event,
  }));
}

export async function acceptInvitation(eventId: string, userId: string) {
  const member = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (!member || member.role !== 'INVITED') {
    throw Object.assign(new Error('No pending invitation'), { status: 404 });
  }

  return prisma.eventMember.update({
    where: { id: member.id },
    data: { role: 'PARTICIPANT' },
  });
}

export async function rejectInvitation(eventId: string, userId: string) {
  const member = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (!member || member.role !== 'INVITED') {
    throw Object.assign(new Error('No pending invitation'), { status: 404 });
  }

  await prisma.eventMember.delete({ where: { id: member.id } });
}

export async function updateEvent(eventId: string, userId: string, data: UpdateEventInput) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw Object.assign(new Error('Event not found'), { status: 404 });
  }
  if (event.creatorId !== userId) {
    throw Object.assign(new Error('Only the creator can update this event'), { status: 403 });
  }

  return prisma.event.update({
    where: { id: eventId },
    data: {
      ...data,
      startTime: data.startTime !== undefined ? (data.startTime ? new Date(data.startTime) : null) : undefined,
      endTime: data.endTime !== undefined ? (data.endTime ? new Date(data.endTime) : null) : undefined,
    },
  });
}

export async function deleteEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw Object.assign(new Error('Event not found'), { status: 404 });
  }
  if (event.creatorId !== userId) {
    throw Object.assign(new Error('Only the creator can delete this event'), { status: 403 });
  }

  await prisma.event.delete({ where: { id: eventId } });
}

export async function joinEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw Object.assign(new Error('Event not found'), { status: 404 });
  }

  // Check if already a member
  const existing = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (existing) {
    throw Object.assign(new Error('Already a member of this event'), { status: 409 });
  }

  if (event.licenseType === 'INVITE_ONLY') {
    throw Object.assign(new Error('This event is invite-only'), { status: 403 });
  }

  return prisma.eventMember.create({
    data: { eventId, userId, role: 'PARTICIPANT' },
  });
}

export async function inviteUser(eventId: string, userId: string, targetUserId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw Object.assign(new Error('Event not found'), { status: 404 });
  }
  if (event.creatorId !== userId) {
    throw Object.assign(new Error('Only the creator can invite users'), { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const existing = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId: targetUserId } },
  });
  if (existing) {
    throw Object.assign(new Error('User is already a member'), { status: 409 });
  }

  return prisma.eventMember.create({
    data: { eventId, userId: targetUserId, role: 'INVITED' },
  });
}

export async function addTrack(eventId: string, data: AddTrackInput, userId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw Object.assign(new Error('Event not found'), { status: 404 });
  }

  // For INVITE_ONLY, must be a member
  if (event.licenseType === 'INVITE_ONLY') {
    const member = await prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!member) {
      throw Object.assign(new Error('You must be a member to add tracks'), { status: 403 });
    }
  }

  return prisma.track.create({
    data: {
      ...data,
      eventId,
      addedById: userId,
    },
  });
}

export async function getEventTracks(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw Object.assign(new Error('Event not found'), { status: 404 });
  }

  return prisma.track.findMany({
    where: { eventId },
    include: {
      addedBy: { select: { id: true, name: true } },
      _count: { select: { votes: true } },
    },
    orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
  });
}
