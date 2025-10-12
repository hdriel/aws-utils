import express, { NextFunction, Response, Request } from 'express';
import { setCredentialsCtrl, unsetCredentialsCtrl } from '../controls/credentials.control';
import { logApiMW } from '../middleware/logAPI.mw';

export const router: express.Router = express.Router();

router.get('/', (_req: Request, res: Response, _next: NextFunction) => {
    res.status(200).json({ status: 'OK' });
});

router.post('/credentials', logApiMW, setCredentialsCtrl);

router.post('/disconnect', logApiMW, unsetCredentialsCtrl);
