import rateLimit from 'express-rate-limit';

const skipInTest = () => !!(process.env.NODE_ENV === 'test' || process.env.VITEST);

// Limite stricte sur les routes d'auth sensibles (login, register, forgot-password)
// 5 tentatives par fenetre de 15 minutes par IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: skipInTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
});

// Limite globale plus souple pour l'API entiere
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: skipInTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
});
