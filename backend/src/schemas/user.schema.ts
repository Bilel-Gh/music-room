import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  publicInfo: z.string().nullable().optional(),
  friendsInfo: z.string().nullable().optional(),
  privateInfo: z.string().nullable().optional(),
  musicPreferences: z.array(z.string()).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
