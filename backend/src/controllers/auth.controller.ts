import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshToken(refreshToken);
    res.json({ success: true, data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code } = req.body;
    const result = await authService.verifyEmail(email, code);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function resendVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const result = await authService.resendVerification(email);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, code, password } = req.body;
    const result = await authService.resetPassword(email, code, password);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function linkGoogle(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { googleId } = req.body;
    const result = await authService.linkGoogle(userId, googleId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function googleMobile(req: Request, res: Response, next: NextFunction) {
  try {
    const { idToken } = req.body;
    const result = await authService.googleMobileLogin(idToken);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const tokens = authService.generateTokensForUser({ id: user.userId, email: user.email });

    // Mobile clients pass state=mobile via the OAuth flow
    const isMobile = req.query.state === 'mobile';
    if (isMobile) {
      res.redirect(`musicroom://auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
    } else {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:8081';
      res.redirect(`${clientUrl}?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
    }
  } catch (err) {
    next(err);
  }
}
