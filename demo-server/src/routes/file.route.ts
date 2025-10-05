import express from 'express';
import {
    getFileInfoCtrl,
    uploadFileCtrl,
    deleteFileCtrl,
    getFileDataCtrl,
    getFileUrlCtrl,
    getFileVersionCtrl,
    toggingFileVersionCtrl,
} from '../controls/file.control';

export const router: express.Router = express.Router();

router.get('/:file/info', getFileInfoCtrl);
router.get('/:file/data', getFileDataCtrl);
router.get('/:file/url', getFileUrlCtrl);
router.get('/:file/version', getFileVersionCtrl);

router.post('/:file', uploadFileCtrl);

router.put('/:file/version', toggingFileVersionCtrl);

router.delete('/:file', deleteFileCtrl);
