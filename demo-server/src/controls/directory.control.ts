import { NextFunction, Request, Response } from 'express';
import { getS3BucketUtil } from '../shared/s3BucketUtil.shared';

export const getDirectoryListCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.directoryList(req.params.directory);

    res.json(result);
};

export const getDirectoryTreeCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.directoryTree(req.params.directory);

    res.json(result);
};

export const createDirectoryCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.createDirectory(req.body.directory);

    res.json(result);
};

export const deleteDirectoryCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.deleteDirectory(req.params.directory);

    res.json(result);
};
