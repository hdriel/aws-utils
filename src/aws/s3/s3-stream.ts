import type { Response, Request, NextFunction, RequestHandler } from 'express';
import path from 'pathe';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { Buffer } from 'buffer';
import archiver from 'archiver';
import { Readable } from 'node:stream';
import multerS3 from 'multer-s3';
import multer, { type Multer } from 'multer';
import { GetObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { ACLs } from '../../utils/consts';
import { s3Limiter } from '../../utils/concurrency';
import type {
    ByteUnitStringValue,
    File,
    FILE_EXT,
    FILE_TYPE,
    FILES3_METADATA,
    S3UploadOptions,
    UploadedS3File,
} from '../../interfaces';
import { getFileSize, getNormalizedPath, parseRangeHeader } from '../../utils/helpers';
import { S3File, type S3FileProps } from './s3-file';

const pump = promisify(pipeline);

export type S3StreamProps = S3FileProps & { maxUploadFileSizeRestriction?: ByteUnitStringValue };

export class S3Stream extends S3File {
    private readonly maxUploadFileSizeRestriction: ByteUnitStringValue;

    constructor({ maxUploadFileSizeRestriction = '10GB', ...props }: S3StreamProps) {
        super(props);
        this.maxUploadFileSizeRestriction = maxUploadFileSizeRestriction;
    }

    protected async streamObjectFile(
        filePath: string,
        {
            Range,
            checkFileExists = true,
            abortSignal,
        }: {
            Range?: string;
            checkFileExists?: boolean;
            abortSignal?: AbortSignal;
        } = {}
    ): Promise<Readable | null> {
        let normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
        if (S3Stream.leadingSlash) normalizedKey = `/${normalizedKey}`;

        if (checkFileExists) {
            const isExists = await this.fileExists(normalizedKey);
            if (!isExists) return null;
        }

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: normalizedKey,
            ...(Range ? { Range } : {}),
        });

        const response = await this.execute<GetObjectCommandOutput>(command, { abortSignal });

        if (!response.Body || !(response.Body instanceof Readable)) {
            throw new Error('Invalid response body: not a Readable stream');
        }

        return response.Body as Readable;
    }

    protected async streamVideoFile({
        filePath,
        Range,
        abortSignal,
    }: {
        filePath: string;
        Range?: string;
        abortSignal?: AbortSignal;
    }): Promise<{
        body: Readable;
        meta: {
            contentType?: string;
            contentLength?: number;
            contentRange?: string;
            acceptRanges?: string;
            etag?: string;
            lastModified?: Date;
        };
    } | null> {
        let normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
        if (S3Stream.leadingSlash) normalizedKey = `/${normalizedKey}`;

        try {
            const cmd = new GetObjectCommand({
                Bucket: this.bucket,
                Key: normalizedKey,
                ...(Range ? { Range } : {}),
            });

            const data: GetObjectCommandOutput = await s3Limiter(() => this.execute(cmd, { abortSignal }));

            const body = data.Body as Readable | undefined;
            if (!body) return null;

            return {
                body,
                meta: {
                    contentType: data.ContentType,
                    contentLength: data.ContentLength,
                    contentRange: data.ContentRange,
                    acceptRanges: data.AcceptRanges,
                    etag: data.ETag,
                    lastModified: data.LastModified,
                },
            };
        } catch (error) {
            this.logger?.warn(this.reqId, 'getS3VideoStream error', {
                Bucket: this.bucket,
                filePath: normalizedKey,
                Range,
                error,
            });
            return null;
        }
    }

    async getStreamZipFileCtr({
        filePath,
        filename: _filename,
        compressionLevel = 5,
    }: {
        filePath: string | string[];
        filename?: string;
        compressionLevel?: number; // Compression level (0-9, lower = faster)
    }) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            const filePaths = ([] as string[])
                .concat(filePath as string[])
                .map((filePath) => getNormalizedPath(filePath))
                .map((normalizedKey) => (S3Stream.leadingSlash ? `/${normalizedKey}` : normalizedKey))
                .filter((v) => v && v !== '/');

            if (!filePaths.length) {
                throw new Error('No file keys provided');
            }

            let filename = _filename || new Date().toISOString();
            filename = filename.endsWith('.zip') ? filename : `${filename}.zip`;

            const abort = new AbortController();
            const onClose = () => {
                abort.abort();
            };

            req.once('close', onClose);

            try {
                this.logger?.info(this.reqId, 'Starting parallel file download...', { fileCount: filePaths.length });

                const downloadPromises = filePaths.map(async (filePath) => {
                    try {
                        if (abort.signal.aborted) return null;

                        const stream = await this.streamObjectFile(filePath, { abortSignal: abort.signal });

                        if (!stream) {
                            this.logger?.warn(this.reqId, 'File not found', { filePath });
                            return null;
                        }

                        const chunks: Buffer[] = [];
                        for await (const chunk of stream) {
                            if (abort.signal.aborted) {
                                stream.destroy();
                                return null;
                            }
                            chunks.push(Buffer.from(chunk));
                        }

                        const buffer = Buffer.concat(chunks);
                        const fileName = filePath.split('/').pop() || filePath;

                        this.logger?.debug(this.reqId, 'File downloaded', {
                            filePath,
                            sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
                        });

                        return { buffer, name: fileName, path: filePath };
                    } catch (error) {
                        this.logger?.warn(this.reqId, 'Failed to download file', { filePath, error });
                        return null;
                    }
                });

                // Wait for all downloads to complete in parallel
                const fileBuffers = (await Promise.all(downloadPromises)).filter(Boolean);

                if (abort.signal.aborted || fileBuffers.length === 0) {
                    req.off('close', onClose);
                    if (fileBuffers.length === 0) {
                        next(new Error('No files available to zip'));
                    }
                    return;
                }

                this.logger?.info(this.reqId, 'All files downloaded, measuring zip size...', {
                    fileCount: fileBuffers.length,
                    totalSizeMB: (fileBuffers.reduce((sum, f) => sum + f!.buffer.length, 0) / (1024 * 1024)).toFixed(2),
                });

                const measureArchive = archiver('zip', { zlib: { level: compressionLevel } });
                let actualZipSize = 0;

                measureArchive.on('data', (chunk: Buffer) => {
                    actualZipSize += chunk.length;
                });

                for (const file of fileBuffers) {
                    if (abort.signal.aborted) break;
                    measureArchive.append(file!.buffer, { name: file!.name });
                }

                await measureArchive.finalize();

                if (abort.signal.aborted) {
                    req.off('close', onClose);
                    return;
                }

                this.logger?.info(this.reqId, 'Zip size calculated', {
                    actualZipSize,
                    sizeMB: (actualZipSize / (1024 * 1024)).toFixed(2),
                });

                const actualArchive = archiver('zip', { zlib: { level: compressionLevel } });

                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.setHeader('Content-Length', String(actualZipSize));
                res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition, Content-Length');

                actualArchive.on('error', (err) => {
                    this.logger?.error(this.reqId, 'Archive error', { error: err });
                    abort.abort();
                    if (!res.headersSent) {
                        next(err);
                    }
                });

                actualArchive.pipe(res as NodeJS.WritableStream);

                // Re-add all files from buffers (instant - no S3 calls!)
                for (const file of fileBuffers) {
                    if (abort.signal.aborted) break;
                    actualArchive.append(file!.buffer, { name: file!.name });
                }

                await actualArchive.finalize();

                this.logger?.info(this.reqId, 'Zip download completed', {
                    fileCount: fileBuffers.length,
                    totalSize: actualZipSize,
                });

                req.off('close', onClose);
            } catch (error: any) {
                abort.abort();

                const isBenignError =
                    error?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                    error?.name === 'AbortError' ||
                    error?.code === 'ECONNRESET';

                if (isBenignError) {
                    return;
                }

                if (!res.headersSent) {
                    this.logger?.error(this.reqId, 'Failed to create zip archive', { error });
                    next(error);
                } else if (!res.writableEnded) {
                    try {
                        res.end();
                    } catch {}
                }
            } finally {
                req.off('close', onClose);
            }
        };
    }

    async getStreamFileCtrl({ filePath, filename }: { filePath: string; filename?: string }) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            const abort = new AbortController();
            let stream: Readable | null = null;

            const onClose = () => {
                abort.abort();
                stream?.destroy?.();
            };

            req.once('close', onClose);

            let normalizedKey = getNormalizedPath(filePath);
            if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
            if (S3Stream.leadingSlash) normalizedKey = `/${normalizedKey}`;

            try {
                const isExists = await this.fileExists(normalizedKey);
                if (!isExists) {
                    req.off('close', onClose);
                    next(Error(`File not found: "${normalizedKey}"`));
                    return;
                }

                stream = await this.streamObjectFile(normalizedKey, {
                    abortSignal: abort.signal,
                    checkFileExists: false,
                });

                if (!stream) {
                    req.off('close', onClose);
                    next(Error(`Failed to get file stream: "${normalizedKey}"`));
                    return;
                }

                const fileInfo = await this.fileInfo(normalizedKey);
                const fileName = filename || normalizedKey.split('/').pop() || 'download';

                res.setHeader('Content-Type', fileInfo.ContentType || 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                if (fileInfo.ContentLength) {
                    res.setHeader('Content-Length', String(fileInfo.ContentLength));
                }

                stream.on('error', (err) => {
                    this.logger?.warn(this.reqId, 'Stream error', { filePath: normalizedKey, error: err });
                    abort.abort();
                    stream?.destroy?.();
                });

                res.once('close', () => {
                    stream?.destroy?.();
                    req.off('close', onClose);
                });

                await pump(stream, res);

                req.off('close', onClose);
            } catch (error: any) {
                abort.abort();
                if (stream) {
                    stream.destroy?.();
                }

                const isBenignStreamError =
                    error?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                    error?.name === 'AbortError' ||
                    error?.code === 'ECONNRESET';

                if (isBenignStreamError) {
                    return;
                }

                this.logger?.error(this.reqId, 'Failed to stream file', { filePath: normalizedKey, error });

                if (!res.headersSent) {
                    next(error);
                } else if (!res.writableEnded) {
                    try {
                        res.end();
                    } catch {}
                }
            } finally {
                req.off('close', onClose);
            }
        };
    }

    async getStreamVideoFileCtrl({
        fileKey,
        allowedWhitelist,
        contentType = 'video/mp4',
        streamTimeoutMS = 30_000,
        bufferMB = 5,
    }: {
        contentType?: string;
        fileKey: string;
        allowedWhitelist?: string[];
        bufferMB?: number | undefined;
        streamTimeoutMS?: number | undefined;
    }) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            let normalizedKey = getNormalizedPath(fileKey);
            if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
            if (S3Stream.leadingSlash) normalizedKey = `/${normalizedKey}`;

            const isExists = await this.fileExists(normalizedKey);
            const fileSize = await this.sizeOf(normalizedKey);
            let Range;

            if (!isExists) {
                next(Error(`File does not exist: "${normalizedKey}"`));
                return;
            }

            try {
                if (req.method === 'HEAD') {
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Accept-Ranges', 'bytes');
                    if (fileSize) res.setHeader('Content-Length', String(fileSize));
                    return res.status(200).end();
                }

                // const bss = +(req.query.bufferStreamingSizeInMB ?? 0);
                // const bufferSize = bss > 0 && bss <= 50 ? bss : (bufferMB ?? 5);
                const bufferSize = bufferMB;
                const CHUNK_SIZE = 10 ** 6 * bufferSize;

                const rangeValues = parseRangeHeader(req.headers.range, fileSize, CHUNK_SIZE);
                let [start, end] = rangeValues || [];
                if (!rangeValues || start < 0 || start >= fileSize || end < 0 || end >= fileSize || start > end) {
                    res.status(416).send('Requested Range Not Satisfiable');
                    return;
                }

                res.statusCode = 206;
                const chunkLength = end - start + 1;
                res.setHeader('Content-Length', chunkLength);
                res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
                res.setHeader('Accept-Ranges', 'bytes');

                res.setHeader('Content-Type', 'video/mp4');
                Range = `bytes=${start}-${end}`;
            } catch (error) {
                next(error);
                return;
            }

            const abort = new AbortController();
            const onClose = () => abort.abort();
            req.once('close', onClose);

            try {
                const result = await this.streamVideoFile({
                    filePath: normalizedKey,
                    Range,
                    abortSignal: abort.signal,
                });
                const { body, meta } = result as any;

                const origin = Array.isArray(allowedWhitelist)
                    ? allowedWhitelist.includes(req.headers.origin ?? '')
                        ? req.headers.origin!
                        : undefined
                    : allowedWhitelist;

                if (origin) {
                    res.setHeader('Access-Control-Allow-Origin', origin);
                    res.setHeader('Vary', 'Origin');
                }

                const finalContentType = contentType.startsWith('video/') ? contentType : `video/${contentType}`;
                res.setHeader('Content-Type', meta.contentType ?? finalContentType);
                res.setHeader('Accept-Ranges', meta.acceptRanges ?? 'bytes');

                if (Range && meta.contentRange) {
                    res.status(206);
                    res.setHeader('Content-Range', meta.contentRange);
                    if (typeof meta.contentLength === 'number') {
                        res.setHeader('Content-Length', String(meta.contentLength));
                    }
                } else if (fileSize) {
                    res.setHeader('Content-Length', String(fileSize));
                }

                if (meta.etag) res.setHeader('ETag', meta.etag);
                if (meta.lastModified) res.setHeader('Last-Modified', meta.lastModified.toUTCString());

                const timeout = setTimeout(() => {
                    abort.abort();
                    if (!res.headersSent) res.status(504);
                    res.end();
                }, streamTimeoutMS);

                res.once('close', () => {
                    clearTimeout(timeout);
                    body.destroy?.();
                    req.off('close', onClose);
                });

                await pump(body, res);

                clearTimeout(timeout);
            } catch (error: any) {
                const isBenignStreamError =
                    error?.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                    error?.name === 'AbortError' ||
                    error?.code === 'ECONNRESET';

                if (isBenignStreamError) {
                    return;
                }

                if (!res.headersSent) {
                    this.logger?.warn(req.id, 'caught exception in stream controller', {
                        error: error?.message ?? String(error),
                        key: fileKey,
                        url: req.originalUrl,
                        userId: req.user?._id,
                    });

                    next(error);
                    return;
                }

                if (!res.writableEnded) {
                    try {
                        res.end();
                    } catch {}
                }

                return;
            }
        };
    }

    private static fileFilter(types?: FILE_TYPE[], fileExt?: FILE_EXT[]) {
        const fileTypesChecker = fileExt?.length ? new RegExp(`\\.(${fileExt.join('|')})$`, 'i') : undefined;

        return function (_req: Request, file: File, cb: multer.FileFilterCallback) {
            const fileExtension = path.extname(file.originalname).substring(1); // Remove the dot
            const extname = fileTypesChecker ? fileTypesChecker.test(`.${fileExtension}`) : true;
            const mimeType = types?.length ? types.some((type) => file.mimetype.startsWith(`${type}/`)) : true;

            if (mimeType && extname) {
                return cb(null, true);
            }

            const errorMsg = !extname
                ? `Upload File Ext Error: Allowed extensions: [${fileExt?.join(', ')}]. Got: ${fileExtension}`
                : `Upload File Type Error: Allowed types: [${types?.join(', ')}]. Got: ${file.mimetype}`;

            return cb(new Error(errorMsg));
        };
    }

    getUploadFileMW(
        directoryPath?: string,
        {
            acl = ACLs.private,
            maxFileSize,
            filename: _filename,
            fileType = [],
            fileExt = [],
            metadata: customMetadata,
        }: S3UploadOptions = {}
    ): Multer {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        if (S3Stream.leadingSlash && !normalizedPath.startsWith('/')) normalizedPath = `/${normalizedPath}`;

        const fileSize = getFileSize(maxFileSize, this.maxUploadFileSizeRestriction);
        const fileTypes = ([] as FILE_TYPE[]).concat(fileType);
        const fileExts = ([] as FILE_EXT[]).concat(fileExt);
        const fileFilter = fileTypes?.length || fileExts?.length ? S3Stream.fileFilter(fileTypes, fileExts) : undefined;

        return multer({
            fileFilter,
            limits: { ...(fileSize && { fileSize }) },
            storage: multerS3({
                acl,
                s3: this.s3Client,
                bucket: this.bucket,
                contentType: multerS3.AUTO_CONTENT_TYPE,
                metadata: async (req: Request & any, file: File, cb: Function) => {
                    const baseMetadata: FILES3_METADATA = { ...file, directory: normalizedPath };

                    if (customMetadata) {
                        const additionalMetadata =
                            typeof customMetadata === 'function' ? await customMetadata(req, file) : customMetadata;
                        Object.assign(baseMetadata, additionalMetadata);
                    }

                    cb(null, baseMetadata);
                },
                key: async (req: Request & any, file: File, cb: Function) => {
                    let filename: string;

                    if (typeof _filename === 'function') {
                        filename = await _filename(req, file);
                    } else if (_filename) {
                        filename = _filename;
                    } else {
                        filename = file.originalname;
                    }

                    filename = decodeURIComponent(filename);
                    const key = `${normalizedPath}${filename}`;
                    cb(null, key);
                },
            }),
        });
    }

    /**
     * Middleware for uploading a single file
     * Adds the uploaded file info to req.s3File
     */
    uploadSingleFile(fieldName: string, directoryPath: string, options: S3UploadOptions = {}) {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';

        this.logger?.debug(null, '####### uploadSingleFile', { directoryPath, normalizedPath, fieldName });

        const upload = this.getUploadFileMW(normalizedPath, options);

        return (req: Request & { s3File?: UploadedS3File } & any, res: Response, next: NextFunction & any) => {
            const mw: RequestHandler & any = upload.single(fieldName);
            mw(req, res, (err: any) => {
                if (err) {
                    this.logger?.error(this.reqId, 'Single file upload error', { fieldName, error: err.message });
                    return next(err);
                }

                if (req.file) {
                    req.s3File = req.file as UploadedS3File;
                    this.logger?.info(this.reqId, 'Single file uploaded successfully', {
                        fieldName,
                        key: req.s3File.key,
                        location: req.s3File.location,
                        size: req.s3File.size,
                    });
                }

                next();
            });
        };
    }

    /**
     * Middleware for uploading multiple files with the same field name
     * Adds the uploaded files info to req.s3Files
     */
    uploadMultipleFiles(fieldName: string, directoryPath: string, options: S3UploadOptions = {}) {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';

        const upload = this.getUploadFileMW(normalizedPath, options);

        return (req: Request & { s3Files?: UploadedS3File[] } & any, res: Response, next: NextFunction & any) => {
            const mw: RequestHandler & any = upload.array(fieldName, options.maxFilesCount || undefined);
            mw(req, res, (err: any) => {
                if (err) {
                    this.logger?.error(this.reqId, 'Multiple files upload error', { fieldName, error: err.message });
                    return next(err);
                }

                if (Array.isArray(req.files)) {
                    req.s3Files = req.files as UploadedS3File[];
                    this.logger?.info(this.reqId, 'Multiple files uploaded successfully', {
                        fieldName,
                        count: req.s3Files.length,
                        keys: req.s3Files.map((f: any) => f.key),
                    });
                }

                next();
            });
        };
    }

    /**
     * Middleware for uploading multiple files with different field names
     * Adds the uploaded files info to req.s3FilesByField
     */
    uploadFieldsFiles(
        fields: Array<{ name: string; directory: string; maxCount?: number; options?: S3UploadOptions }>
    ): RequestHandler {
        // Create separate multer instances for each field (since each might have different options)
        const fieldConfigs = fields.map((field) => {
            const upload = this.getUploadFileMW(field.directory, field.options || {});
            return {
                name: field.name,
                maxCount: field.maxCount || 1,
                upload,
                directory: field.directory,
            };
        });

        return async (
            req: Request & { s3FilesByField?: Record<string, UploadedS3File[]> } & any,
            res: Response,
            next: NextFunction & any
        ) => {
            // We'll use the first upload instance but with fields configuration
            const multerFields = fieldConfigs.map((f) => ({ name: f.name, maxCount: f.maxCount }));
            const upload = this.getUploadFileMW(fieldConfigs[0].directory);

            const mw: RequestHandler & any = upload.fields(multerFields);
            mw(req, res, (err: any) => {
                if (err) {
                    this.logger?.error(this.reqId, 'Fields upload error', { error: err.message });
                    return next(err);
                }

                if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
                    req.s3FilesByField = req.files as Record<string, UploadedS3File[]>;

                    const uploadSummary = Object.entries(req.s3FilesByField).map(([field, files]: any) => ({
                        field,
                        count: files.length,
                        keys: files.map((f: any) => f.key),
                    }));

                    this.logger?.info(this.reqId, 'Fields uploaded successfully', { uploadSummary });
                }

                next();
            });
        };
    }

    /**
     * Middleware for uploading any files (mixed field names)
     * Adds the uploaded files info to req.s3AllFiles
     */
    uploadAnyFiles(directoryPath: string, maxCount?: number, options: S3UploadOptions = {}): RequestHandler {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';

        const upload = this.getUploadFileMW(normalizedPath, options);

        return (req: Request & { s3AllFiles?: UploadedS3File[] } & any, res: Response, next: NextFunction & any) => {
            const anyUpload: RequestHandler & any = maxCount ? upload.any() : upload.any();

            anyUpload(req, res, (err: any) => {
                if (err) {
                    this.logger?.error(this.reqId, 'Any files upload error', { error: err.message });
                    return next(err);
                }

                if (req.files && Array.isArray(req.files)) {
                    req.s3AllFiles = req.files as UploadedS3File[];

                    if (maxCount && req.s3AllFiles.length > maxCount) {
                        return next(new Error(`Too many files uploaded. Maximum is ${maxCount}`));
                    }

                    this.logger?.info(this.reqId, 'Any files uploaded successfully', {
                        count: req.s3AllFiles.length,
                        keys: req.s3AllFiles.map((f: any) => f.key),
                    });
                }

                next();
            });
        };
    }

    getImageFileViewCtrl = ({
        fileKey: _fileKey,
        queryField = 'file',
        cachingAge = 31536000,
    }: { fileKey?: string; queryField?: string; cachingAge?: number } = {}) => {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            let fileKey =
                _fileKey ||
                (req.query?.[queryField] ? decodeURIComponent(req.query?.[queryField] as string) : undefined);

            if (!fileKey) {
                this.logger?.warn(req.id, 'image file view required file query field', {
                    fileKey: req.query?.[queryField],
                    queryField,
                });

                next('image file key is required');
                return;
            }

            try {
                if (S3Stream.leadingSlash && !fileKey.startsWith('/')) fileKey = `/${fileKey}`;

                const imageBuffer = await this.fileContent(fileKey, 'buffer');
                const ext = path.extname(fileKey).slice(1).toLowerCase();

                const mimeTypeMap: Record<string, string> = {
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg',
                    png: 'image/png',
                    gif: 'image/gif',
                    webp: 'image/webp',
                    svg: 'image/svg+xml',
                    ico: 'image/x-icon',
                };

                const contentType = mimeTypeMap[ext] || 'application/octet-stream';
                res.setHeader('Content-Type', contentType);
                if (cachingAge) res.setHeader('Cache-Control', `public, max-age=${cachingAge}`);
                res.setHeader('Content-Length', imageBuffer.length);

                res.status(200).send(imageBuffer);
            } catch (error: any) {
                this.logger?.warn(req.id, 'image view fileKey not found', { fileKey });
                next(`Failed to retrieve image file: ${error.message}`);
            }
        };
    };

    getPdfFileViewCtrl = ({
        fileKey: _fileKey,
        queryField = 'file',
        cachingAge = 31536000,
    }: { fileKey?: string; queryField?: string; cachingAge?: number } = {}) => {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            let fileKey =
                _fileKey ||
                (req.query?.[queryField] ? decodeURIComponent(req.query?.[queryField] as string) : undefined);

            if (!fileKey) {
                next('pdf file key is required');
                return;
            }

            try {
                if (S3Stream.leadingSlash && !fileKey.startsWith('/')) fileKey = `/${fileKey}`;
                const fileBuffer = await this.fileContent(fileKey, 'buffer');
                const ext = path.extname(fileKey).slice(1).toLowerCase();

                const mimeTypeMap: Record<string, string> = {
                    pdf: 'application/pdf',
                    txt: 'text/plain',
                    doc: 'application/msword',
                    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    xls: 'application/vnd.ms-excel',
                    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    ppt: 'application/vnd.ms-powerpoint',
                    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                };

                const contentType = mimeTypeMap[ext] || 'application/octet-stream';

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `inline; filename="${path.basename(fileKey)}"`);
                res.setHeader('Cache-Control', `public, max-age=${cachingAge}`);
                res.setHeader('Content-Length', fileBuffer.length);

                res.status(200).send(fileBuffer);
            } catch (error: any) {
                next(`Failed to retrieve pdf file: ${error.message}`);
            }
        };
    };
}
