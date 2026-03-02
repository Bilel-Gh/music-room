import rateLimit from 'express-rate-limit';

const skipInTest = () => !!(process.env.NODE_ENV === 'test' || process.env.VITEST);

// Strict limit on sensitive auth routes (login, register, forgot-password)
// 5 attempts per 15-minute window per IP
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

// Softer global limit for the entire API
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
