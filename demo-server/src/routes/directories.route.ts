import express from 'express';
import {
    createDirectoryCtrl,
    deleteDirectoryCtrl,
    getDirectoryListCtrl,
    getDirectoryTreeCtrl,
} from '../controls/directory.control';
import { logApiMW } from '../middleware/logAPI.mw';

export const router: express.Router = express.Router();

router.use(logApiMW);

router.get('/', getDirectoryListCtrl);

router.get('/tree', getDirectoryTreeCtrl);

router.get('/tree/:directory', getDirectoryTreeCtrl);

router.get('/:directory', getDirectoryListCtrl);

router.post('/', createDirectoryCtrl);

router.delete('/', deleteDirectoryCtrl);
