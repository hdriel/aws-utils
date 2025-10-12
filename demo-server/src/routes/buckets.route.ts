import express from 'express';
import {
    createBucketCtrl,
    deleteBucketCtrl,
    deleteLocalstackBucketCtrl,
    getBucketDirectoryTreeCtrl,
    getBucketInfoCtrl,
    getBucketListCtrl,
    getLocalstackBucketListCtrl,
} from '../controls/bucket.control';
import { logApiMW } from '../middleware/logAPI.mw';

export const router: express.Router = express.Router();

router.use(logApiMW);

router.get('/localstack', getLocalstackBucketListCtrl);
router.get('/', getBucketListCtrl);

router.get('/bucket-info', getBucketInfoCtrl);

router.get('/:bucket', getBucketDirectoryTreeCtrl);

router.post('/', createBucketCtrl);

router.delete('/localstack/:bucket', deleteLocalstackBucketCtrl);
router.delete('/:bucket', deleteBucketCtrl);
