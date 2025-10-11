import { NextFunction, Request, Response } from 'express';
import logger from '../logger';

export const logApiMW = (req: Request, _res: Response, next: NextFunction) => {
    logger.http(req.id, 'call to api', { api: `${req.method} ${req.originalUrl}` });
    next();
};
