import express from 'express';
import {
    createDirectoryCtrl,
    deleteDirectoryCtrl,
    getDirectoryListCtrl,
    getDirectoryTreeCtrl,
} from '../controls/directory.control';

export const router: express.Router = express.Router();

router.get('/', getDirectoryListCtrl);

router.get('/:directory', getDirectoryListCtrl);

router.get('/tree', getDirectoryTreeCtrl);

router.get('/tree/:directory', getDirectoryTreeCtrl);

router.post('/', createDirectoryCtrl);

router.delete('/:directory', deleteDirectoryCtrl);
