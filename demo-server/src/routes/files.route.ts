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
    downloadFilesAsZipCtrl,
    streamVideoFilesCtrl,
    viewImageFileCtrl,
    uploadMultiFilesCtrl,
} from '../controls/file.control';
import { logApiMW } from '../middleware/logAPI.mw';

export const router: express.Router = express.Router();

router.use(logApiMW);

router.post('/content', uploadFileDataCtrl);
router.post(['/upload/:fileType', '/upload'], uploadSingleFileCtrl);
router.post(['/multi-upload/:fileType', '/multi-upload'], uploadMultiFilesCtrl);

router.get('/image', viewImageFileCtrl);

router.get('/download', downloadFilesAsZipCtrl);
router.get('/stream', streamVideoFilesCtrl);
router.get('/info', getFileInfoCtrl);
router.get('/data', getFileDataCtrl);
router.get('/url', getFileUrlCtrl);

router.get('/version', getFileVersionCtrl);
router.put('/version', toggingFileVersionCtrl);

router.delete('/', deleteFileCtrl);
