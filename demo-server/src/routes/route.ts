import { Express } from 'express';

import { router as mainRouter } from './main.route';
import { router as bucketsRoute } from './buckets.route';
import { router as directoriesRoute } from './directories.route';
import { router as filesRoute } from './files.route';

export const initAppRoutes = (app: Express) => {
    app.use('/', mainRouter);
    app.use('/buckets', bucketsRoute);
    app.use('/directories', directoriesRoute);
    app.use('/files', filesRoute);
};
