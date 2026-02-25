import { z } from 'zod';

export const createPlaylistSchema = z.object({
  name: z.string().min(2, 'Playlist name must be at least 2 characters'),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
  licenseType: z.enum(['OPEN', 'INVITE_ONLY']).optional(),
});

export const updatePlaylistSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  licenseType: z.enum(['OPEN', 'INVITE_ONLY']).optional(),
});

export const addPlaylistTrackSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  artist: z.string().min(1, 'Artist is required'),
  externalUrl: z.string().url().optional(),
});

export const reorderTrackSchema = z.object({
  newPosition: z.number().int().min(0, 'Position must be >= 0'),
});

export const inviteUserSchema = z.object({
  userId: z.string().uuid(),
  canEdit: z.boolean().optional(),
});

export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type AddPlaylistTrackInput = z.infer<typeof addPlaylistTrackSchema>;
export type ReorderTrackInput = z.infer<typeof reorderTrackSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
