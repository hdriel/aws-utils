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

app.use((err: any, req: express.Request, res: express.Response, _next: any) => {
    logger.error(req.id, 'request error', { error: err.message });
    res.status(500).json({ message: err.message });
});

const PORT = 5001;
app.listen(PORT, () => {
    logger.info(null, 'server is up', { port: PORT });
});
