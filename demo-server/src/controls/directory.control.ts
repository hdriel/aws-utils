import { NextFunction, Request, Response } from 'express';
import { getS3BucketUtil } from '../shared';

export const getDirectoryListCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const directory = req.query?.directory ? decodeURIComponent(req.query?.directory as string) : undefined;
    const result = await s3BucketUtil.directoryList(directory);

    res.json(result);
};

export const getDirectoryFileListCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const directory = req.query?.directory ? decodeURIComponent(req.query?.directory as string) : undefined;
    const result = await s3BucketUtil.fileListInfo(directory);

    res.json(result);
};

export const getDirectoryTreeCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const directory = req.query?.directory ? decodeURIComponent(req.query?.directory as string) : undefined;
    const result = await s3BucketUtil.directoryTree(directory);

    res.json(result);
};

export const createDirectoryCtrl = async (req: Request, res: Response, next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const directory = req.body?.directory as string;
    if (!directory) {
        return next(new Error('No directory path provided'));
    }

    const result = await s3BucketUtil.createDirectory(directory);

    res.json(result);
};

export const deleteDirectoryCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    if (!s3BucketUtil) {
        res.status(403).json({ error: 'credentials not found' });
        return;
    }

    const result = await s3BucketUtil.deleteDirectory(req.body.directory);

    res.json(result);
};
