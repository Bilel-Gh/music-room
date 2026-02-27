import prisma from '../lib/prisma.js';

// Distance in km between two points (simplified Haversine formula)
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MAX_DISTANCE_KM = 5;

export async function voteForTrack(
  trackId: string,
  userId: string,
  userLat?: number,
  userLon?: number,
) {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { event: true },
  });

  if (!track) {
    throw Object.assign(new Error('Track not found'), { status: 404 });
  }

  const event = track.event;

  // Check based on license type
  if (event.licenseType === 'INVITE_ONLY') {
    const member = await prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId: event.id, userId } },
    });
    if (!member) {
      throw Object.assign(new Error('You must be a member to vote'), { status: 403 });
    }
  }

  if (event.licenseType === 'LOCATION_TIME') {
    // Time slot check
    const now = new Date();
    if (event.startTime && now < event.startTime) {
      throw Object.assign(new Error('Event has not started yet'), { status: 403 });
    }
    if (event.endTime && now > event.endTime) {
      throw Object.assign(new Error('Event has ended'), { status: 403 });
    }

    // Location check
    if (event.latitude != null && event.longitude != null) {
      if (userLat == null || userLon == null) {
        throw Object.assign(new Error('Location required for this event'), { status: 400 });
      }
      const dist = distanceKm(userLat, userLon, event.latitude, event.longitude);
      if (dist > MAX_DISTANCE_KM) {
        throw Object.assign(new Error('You are too far from the event'), { status: 403 });
      }
    }
  }

  // Transaction to avoid race conditions on vote
  const result = await prisma.$transaction(async (tx) => {
    const existingVote = await tx.vote.findUnique({
      where: { trackId_userId: { trackId, userId } },
    });

    if (existingVote) {
      throw Object.assign(new Error('You already voted for this track'), { status: 409 });
    }

    await tx.vote.create({ data: { trackId, userId } });

    const updatedTrack = await tx.track.update({
      where: { id: trackId },
      data: { voteCount: { increment: 1 } },
    });

    return updatedTrack;
  });

  return result;
}
