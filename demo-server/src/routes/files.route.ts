import express from 'express';
import {
    getFileInfoCtrl,
    uploadFileDataCtrl,
    deleteFileCtrl,
    getFileDataCtrl,
    getFileUrlCtrl,
    getFileVersionCtrl,
    toggingFileVersionCtrl,
    uploadSingleFileCtrl,
} from '../controls/file.control';
import { logApiMW } from '../middleware/logAPI.mw';

export const router: express.Router = express.Router();

router.use(logApiMW);

router.post('/content', uploadFileDataCtrl);
router.post('/upload', uploadSingleFileCtrl);

router.get('/:file/info', getFileInfoCtrl);
router.get('/:file/data', getFileDataCtrl);
router.get('/:file/url', getFileUrlCtrl);
router.get('/:file/version', getFileVersionCtrl);

router.put('/:file/version', toggingFileVersionCtrl);

router.delete('/:file', deleteFileCtrl);
