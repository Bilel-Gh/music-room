import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import type { RegisterInput } from '../schemas/auth.schema.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';

function generateTokens(user: { id: string; email: string }) {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, email: user.email },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw Object.assign(new Error('Email already in use'), { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  // Generate a 6-digit verification code
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      name: data.name,
      verificationCode,
      verificationCodeExpiry,
    },
  });

  console.log(`[EMAIL VERIFICATION] Code for ${user.email}: ${verificationCode}`);

  const tokens = generateTokens(user);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    ...tokens,
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.password) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const tokens = generateTokens(user);

  return {
    user: { id: user.id, email: user.email, name: user.name },
    ...tokens,
  };
}

export async function refreshToken(token: string) {
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string; email: string };

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 401 });
    }

    return generateTokens(user);
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
    }
    throw err;
  }
}

export async function verifyEmail(email: string, code: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  if (user.emailVerified) {
    throw Object.assign(new Error('Email already verified'), { status: 400 });
  }

  if (
    user.verificationCode !== code ||
    !user.verificationCodeExpiry ||
    user.verificationCodeExpiry < new Date()
  ) {
    throw Object.assign(new Error('Invalid or expired code'), { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationCode: null,
      verificationCodeExpiry: null,
    },
  });

  return { message: 'Email verified' };
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Don't reveal whether the email exists
  if (!user) return { message: 'If this email exists, a reset link has been sent' };

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  });

  console.log(`[PASSWORD RESET] Token for ${email}: ${resetToken}`);

  return { message: 'If this email exists, a reset link has been sent' };
}

export async function resetPassword(token: string, newPassword: string) {
  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    throw Object.assign(new Error('Invalid or expired reset token'), { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  return { message: 'Password updated' };
}

export async function linkGoogle(userId: string, googleId: string) {
  const existing = await prisma.user.findUnique({ where: { googleId } });
  if (existing) {
    throw Object.assign(new Error('This Google account is already linked to another user'), { status: 409 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { googleId },
  });

  return { user: { id: user.id, email: user.email, name: user.name, googleId: user.googleId } };
}

export function generateTokensForUser(user: { id: string; email: string }) {
  return generateTokens(user);
}

interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string;
  name?: string;
  aud: string;
}

export async function googleMobileLogin(idToken: string) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
  if (!res.ok) {
    throw Object.assign(new Error('Invalid Google token'), { status: 401 });
  }

  const payload: GoogleTokenInfo = await res.json();

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw Object.assign(new Error('Token audience mismatch'), { status: 401 });
  }

  if (payload.email_verified !== 'true') {
    throw Object.assign(new Error('Google email not verified'), { status: 401 });
  }

  const { email, sub: googleId } = payload;

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
  });

  if (user && !user.googleId) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { googleId, emailVerified: true },
    });
  } else if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: payload.name || email.split('@')[0],
        googleId,
        emailVerified: true,
      },
    });
  }

  return {
    user: { id: user!.id, email: user!.email, name: user!.name },
    ...generateTokens({ id: user!.id, email: user!.email }),
  };
}
