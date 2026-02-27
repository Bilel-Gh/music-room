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
  forgotPasswordSchema,
  resetPasswordSchema,
  linkGoogleSchema,
} from '../schemas/auth.schema.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Créer un compte
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
 *                 example: motdepasse123
 *               name:
 *                 type: string
 *                 example: Jean Dupont
 *     responses:
 *       201:
 *         description: Compte créé
 *       400:
 *         description: Données invalides
 *       409:
 *         description: Email déjà utilisé
 */
router.post('/register', authLimiter, validate(registerSchema), authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Se connecter
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
 *                 example: motdepasse123
 *     responses:
 *       200:
 *         description: Connexion réussie
 *       401:
 *         description: Identifiants invalides
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renouveler les tokens
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
 *         description: Nouveaux tokens
 *       401:
 *         description: Refresh token invalide
 */
router.post('/refresh', validate(refreshSchema), authController.refresh);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Vérifier son email avec le code à 6 chiffres
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
 *         description: Email vérifié
 *       400:
 *         description: Code invalide ou expiré
 *       404:
 *         description: Utilisateur non trouvé
 */
router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Demander un token de réinitialisation
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
 *         description: Demande acceptée (token dans les logs serveur)
 */
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Réinitialiser le mot de passe
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 example: nouveaumotdepasse
 *     responses:
 *       200:
 *         description: Mot de passe mis à jour
 *       400:
 *         description: Token invalide ou expiré
 */
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

/**
 * @swagger
 * /auth/link-google:
 *   put:
 *     summary: Lier un compte Google (route protégée)
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
 *         description: Google lié
 *       401:
 *         description: Non authentifié
 *       409:
 *         description: Google déjà lié à un autre compte
 */
router.put('/link-google', authenticate, validate(linkGoogleSchema), authController.linkGoogle);

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Connexion via Google (redirige vers Google)
 *     tags: [Auth - OAuth]
 *     responses:
 *       302:
 *         description: Redirection vers Google
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
 *     summary: Callback Google OAuth
 *     tags: [Auth - OAuth]
 *     responses:
 *       302:
 *         description: Redirection vers le client avec tokens en query params
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/google' }),
  authController.googleCallback
);

export default router;
