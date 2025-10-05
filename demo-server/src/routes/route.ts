import { Express } from 'express';

import { router as mainRouter } from './main.route';
import { router as bucketRoute } from './bucket.route';
import { router as directoryRoute } from './directory.route';
import { router as fileRoute } from './file.route';

export const initAppRoutes = (app: Express) => {
    app.use('/', mainRouter);
    app.use('/bucket', bucketRoute);
    app.use('/directory', directoryRoute);
    app.use('/file', fileRoute);
};
