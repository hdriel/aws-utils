import { NextFunction, Request, Response } from 'express';
import { getS3BucketUtil } from '../shared/s3BucketUtil.shared';

export const getFileInfoCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.fileInfo(req.params.file);

    res.json(result);
};

export const getFileDataCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.fileContent(req.params.file, 'utf8');

    res.json(result);
};

export const getFileUrlCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.generateSignedFileUrl(
        req.params.file,
        req.query?.expireIn ? +req.query.expireIn : undefined
    );

    res.json(result);
};

export const getFileVersionCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.fileVersion(req.params.file);

    res.json(result);
};
export const toggingFileVersionCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.taggingFile(req.params.file, req.body);

    res.json(result);
};

export const deleteFileCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const result = await s3BucketUtil.deleteDirectory(req.params.directory);

    res.json(result);
};

export const uploadSingleFileCtrl = async (req: Request, res: Response, next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();

    const paths = req.body.path.split('/');
    paths.pop();
    const directory = paths.join('/');

    const result = s3BucketUtil.uploadSingleFile('file', directory);
    result(req, res, next);
};

export const uploadFileDataCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filename = req.body.path;
    const result = await s3BucketUtil.uploadFile(filename, req.body.file);

    res.json(result);
};
