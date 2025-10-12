import { NextFunction, Request, Response } from 'express';
import { changeS3BucketUtil, getS3BucketUtil } from '../shared';
import { getLocalstackS3BucketUtil } from '../shared/s3BucketUtil.shared';

export const getBucketListCtrl = async (_req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const result = await s3BucketUtil.getBucketList();

    res.json(result);
};

export const getBucketInfoCtrl = async (_req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const result = await s3BucketUtil.bucketInfo();

    res.json(result);
};

export const getBucketDirectoryTreeCtrl = async (_req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const result = await s3BucketUtil.directoryTree();

    res.json(result);
};

export const createBucketCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    await changeS3BucketUtil(req.body.bucket, req.body.acl)
        .then(() => {
            res.sendStatus(200);
        })
        .catch((err) => {
            res.status(403).json({ message: err.message });
        });
};

export const deleteBucketCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const result = await s3BucketUtil.destroyBucket(!!+(req.query.force ?? '0'));

    res.json(result);
};

export const getLocalstackBucketListCtrl = async (_req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getLocalstackS3BucketUtil();
    let result = await s3BucketUtil.getBucketList({}, true);
    if (!result) {
        res.status(403).json({ error: 'Error on getting localstack bucket list' });
    }

    res.json(result);
};

export const deleteLocalstackBucketCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getLocalstackS3BucketUtil(req.params.bucket);
    const result = await s3BucketUtil.destroyBucket(true);

    res.json(result);
};
