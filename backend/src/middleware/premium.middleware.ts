import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { FEATURES } from '../config/features.js';

const prisma = new PrismaClient();

export async function requirePremium(req: Request, res: Response, next: NextFunction) {
  if (!FEATURES.premiumEnabled) {
    next();
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { isPremium: true },
  });

  if (!user?.isPremium) {
    res.status(403).json({ success: false, error: 'Premium subscription required' });
    return;
  }

  next();
}
