import { Router } from 'express';
import passport from '../config/passport.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authLimiter } from '../config/rate-limit.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  linkGoogleSchema,
  googleMobileSchema,
} from '../schemas/auth.schema.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Create an account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email:
 *                 type: string
 *                 example: jean@example.com
 *               password:
 *                 type: string
 *                 example: mypassword123
 *               name:
 *                 type: string
 *                 example: Jean Dupont
 *     responses:
 *       201:
 *         description: Account created
 *       400:
 *         description: Invalid data
 *       409:
 *         description: Email already in use
 */
router.post('/register', authLimiter, validate(registerSchema), authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: jean@example.com
 *               password:
 *                 type: string
 *                 example: mypassword123
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', validate(refreshSchema), authController.refresh);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify email with 6-digit code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *                 example: jean@example.com
 *               code:
 *                 type: string
 *                 example: "482917"
 *     responses:
 *       200:
 *         description: Email verified
 *       400:
 *         description: Invalid or expired code
 *       404:
 *         description: User not found
 */
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     summary: Resend email verification code
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: jean@example.com
 *     responses:
 *       200:
 *         description: Code resent if email exists
 *       400:
 *         description: Email already verified
 */
router.post('/resend-verification', authLimiter, validate(resendVerificationSchema), authController.resendVerification);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: jean@example.com
 *     responses:
 *       200:
 *         description: Request accepted (token in server logs)
 */
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: jean@example.com
 *               code:
 *                 type: string
 *                 example: "482917"
 *               password:
 *                 type: string
 *                 example: newpassword123
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Invalid or expired code
 */
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

/**
 * @swagger
 * /auth/link-google:
 *   put:
 *     summary: Link a Google account (protected route)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [googleId]
 *             properties:
 *               googleId:
 *                 type: string
 *                 example: "google-123456"
 *     responses:
 *       200:
 *         description: Google account linked
 *       401:
 *         description: Not authenticated
 *       409:
 *         description: Google account already linked to another user
 */
router.put('/link-google', authenticate, validate(linkGoogleSchema), authController.linkGoogle);

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Google OAuth login (redirects to Google)
 *     tags: [Auth - OAuth]
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get('/google', (req, res, next) => {
  // Mobile clients pass ?platform=mobile — forward it as OAuth state
  const state = req.query.platform === 'mobile' ? 'mobile' : undefined;
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, state })(req, res, next);
});

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Auth - OAuth]
 *     responses:
 *       302:
 *         description: Redirect to client with tokens as query params
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/google' }),
  authController.googleCallback
);

/**
 * @swagger
 * /auth/google/mobile:
 *   post:
 *     summary: Google OAuth for mobile (verify ID token from expo-auth-session)
 *     tags: [Auth - OAuth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns JWT tokens
 *       401:
 *         description: Invalid Google token
 */
router.post('/google/mobile', authLimiter, validate(googleMobileSchema), authController.googleMobile);

export default router;
