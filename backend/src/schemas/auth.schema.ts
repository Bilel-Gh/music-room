import { z } from 'zod';

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const registerSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string(),
});

export const refreshSchema = z.object({
  refreshToken: z.string(),
});

export const verifyEmailSchema = z.object({
  email: z.email(),
  code: z.string().length(6, 'Code must be 6 digits'),
});

export const resendVerificationSchema = z.object({
  email: z.email(),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z.object({
  email: z.email(),
  code: z.string().length(6, 'Code must be 6 digits'),
  password: passwordSchema,
});

export const linkGoogleSchema = z.object({
  googleId: z.string(),
});

export const googleMobileSchema = z.object({
  idToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type LinkGoogleInput = z.infer<typeof linkGoogleSchema>;
