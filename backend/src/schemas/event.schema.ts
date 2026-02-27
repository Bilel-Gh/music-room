import { z } from 'zod';

export const createEventSchema = z.object({
  name: z.string().min(2, 'Event name must be at least 2 characters'),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
  licenseType: z.enum(['OPEN', 'INVITE_ONLY', 'LOCATION_TIME']).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const updateEventSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  licenseType: z.enum(['OPEN', 'INVITE_ONLY', 'LOCATION_TIME']).optional(),
  startTime: z.string().datetime().nullable().optional(),
  endTime: z.string().datetime().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const addTrackSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  artist: z.string().min(1, 'Artist is required'),
  externalUrl: z.string().url().optional(),
});

export const voteSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const joinEventSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const inviteEventSchema = z.object({
  userId: z.string().uuid(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type AddTrackInput = z.infer<typeof addTrackSchema>;
export type VoteInput = z.infer<typeof voteSchema>;
export type JoinEventInput = z.infer<typeof joinEventSchema>;
export type InviteEventInput = z.infer<typeof inviteEventSchema>;
