import express, { Express } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import logger from './logger';
import { initAppRoutes } from './routes/route';

export const app: Express = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req: express.Request, _res: express.Response, next: any) => {
    req.id = req.id || 'UNKNOWN_ID';
    next();
});

initAppRoutes(app);

const PORT = 5001;
app.listen(PORT, () => {
    logger.info(null, 'server is up', { port: PORT });
});
