import express, { NextFunction, Response, Request } from 'express';
import { setCredentialsCtrl } from '../controls/credentials.control';

export const router: express.Router = express.Router();

router.get('/', (_req: Request, res: Response, _next: NextFunction) => {
    res.status(200).json({ status: 'OK' });
});

router.post('/credentials', setCredentialsCtrl);
