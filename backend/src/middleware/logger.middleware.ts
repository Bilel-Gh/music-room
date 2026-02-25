import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.js';

export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const platform = req.headers['x-platform'] || 'unknown';
  const device = req.headers['x-device'] || 'unknown';
  const appVersion = req.headers['x-app-version'] || 'unknown';
  const userId = req.user?.userId || 'anonymous';

  logger.info(
    `${req.method} ${req.originalUrl} | user=${userId} | platform=${platform} | device=${device} | version=${appVersion}`,
  );

  next();
}
