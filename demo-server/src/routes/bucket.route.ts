import express from 'express';
import {
    createBucketCtrl,
    deleteBucketCtrl,
    getBucketDirectoryTreeCtrl,
    getBucketListCtrl,
} from '../controls/bucket.control';

export const router: express.Router = express.Router();

router.get('/:bucket', getBucketListCtrl);

router.get('/', getBucketDirectoryTreeCtrl);

router.post('/', createBucketCtrl);

router.delete('/:bucket', deleteBucketCtrl);
