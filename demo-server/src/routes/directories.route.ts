import express from 'express';
import {
    createDirectoryCtrl,
    deleteDirectoryCtrl,
    getDirectoryFileListCtrl,
    getDirectoryListCtrl,
    getDirectoryTreeCtrl,
} from '../controls/directory.control';
import { logApiMW } from '../middleware/logAPI.mw';

export const router: express.Router = express.Router();

router.use(logApiMW);

router.get('/', getDirectoryListCtrl);

router.get('/files', getDirectoryFileListCtrl);

router.get('/tree', getDirectoryTreeCtrl);

router.get('/tree/:directory', getDirectoryTreeCtrl);

router.post('/', createDirectoryCtrl);

router.delete('/', deleteDirectoryCtrl);
