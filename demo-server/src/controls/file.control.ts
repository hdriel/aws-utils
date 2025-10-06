import { NextFunction, Request, Response } from 'express';
import { getS3BucketUtil, type UploadedS3File } from '../shared';
import logger from '../logger';

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

export const uploadSingleFileCtrl = (req: Request & { s3File?: UploadedS3File }, res: Response, next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();

    const directory = (req.headers['x-upload-directory'] as string) || '';
    const filename = req.headers['x-upload-filename'] as string;

    if (!directory) {
        return res.status(400).json({ error: 'Directory header is required' });
    }

    logger.info(req.id, 'uploading single file', { filename, directory });

    const uploadMiddleware = s3BucketUtil.uploadSingleFile('file', directory, {
        filename: filename || undefined,
    });

    const uploadedCallback = (err?: any) => {
        if (err) {
            logger.warn(req.id, 'failed to upload single file', { message: err.message });
            return next(err);
        }

        const s3File = req.s3File;

        if (s3File) {
            const file = {
                key: s3File.key,
                location: s3File.location,
                bucket: s3File.bucket,
                etag: s3File.etag,
                size: s3File.size,
            };

            logger.info(req.id, 'file uploaded', file);
            return res.json({ success: true, file });
        }

        return res.status(400).json({ error: 'No file uploaded' });
    };

    return uploadMiddleware(req, res, uploadedCallback);
};

export const uploadFileDataCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filename = req.body.path;
    const result = await s3BucketUtil.uploadFile(filename, req.body.file);

    res.json(result);
};
