import { NextFunction, Request, Response } from 'express';
import { getS3BucketUtil, type UploadedS3File } from '../shared';
import logger from '../logger';

export const getFileInfoCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filePath = req.query.filePath as string;

    const result = await s3BucketUtil.fileInfo(filePath);

    res.json(result);
};

export const getFileDataCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filePath = req.query.filePath as string;

    const result = await s3BucketUtil.fileContent(filePath, 'utf8');

    res.json(result);
};

export const getFileUrlCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filePath = req.query.filePath as string;
    const expireIn = req.query?.expireIn ? +req.query.expireIn : undefined;

    const result = await s3BucketUtil.generateSignedFileUrl(filePath, expireIn);

    res.json(result);
};

export const getFileVersionCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filePath = req.query.filePath as string;

    const result = await s3BucketUtil.fileVersion(filePath);

    res.json(result);
};
export const toggingFileVersionCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filePath = req.query.filePath as string;

    const result = await s3BucketUtil.taggingFile(filePath, req.body);

    res.json(result);
};

export const deleteFileCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filePath = req.query.filePath as string;

    const result = await s3BucketUtil.deleteFile(filePath);

    res.json(result);
};

export const uploadSingleFileCtrl = (req: Request & { s3File?: UploadedS3File }, res: Response, next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();

    const encodedDirectory = (req.headers['x-upload-directory'] as string) || '';
    const encodedFilename = req.headers['x-upload-filename'] as string;

    if (!encodedDirectory) {
        return res.status(400).json({ error: 'Directory header is required' });
    }

    const directory = decodeURIComponent(encodedDirectory);
    const filename = encodedFilename ? decodeURIComponent(encodedFilename) : undefined;

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

export const downloadFilesAsZipCtrl = async (req: Request, res: Response, next: NextFunction) => {
    const s3BucketUtil = getS3BucketUtil();
    const filePath = ([] as string[])
        .concat(req.query.file as string[])
        .filter((v) => v)
        .map((file) => decodeURIComponent(file));

    if (Array.isArray(filePath)) {
        const downloadMiddleware = await s3BucketUtil.getStreamZipFileCtr({ filePath });
        return downloadMiddleware(req, res, next);
    }

    return res.sendStatus(500);

    // const data = await s3BucketUtil.getObjectStream(filePath);
};
