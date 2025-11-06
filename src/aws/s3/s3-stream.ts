import type { Response, Request, NextFunction, RequestHandler } from 'express';
import { basename, extname } from 'pathe';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { Buffer } from 'buffer';
import archiver from 'archiver';
import { Readable } from 'node:stream';
import multerS3 from 'multer-s3';
import multer, { type Multer } from 'multer';
import { GetObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { ACLs, SUPPORTED_IFRAME_EXTENSIONS } from '../../utils/consts';
import type {
    ByteUnitStringValue,
    File,
    FILE_EXT,
    FILE_TYPE,
    FILES3_METADATA,
    S3UploadOptions,
    UploadedS3File,
} from '../../interfaces';
import {
    encodeS3Metadata,
    getFileSize,
    getNormalizedPath,
    getTotalSeconds,
    getUnitBytes,
    hasNonAscii,
    parseRangeHeader,
} from '../../utils/helpers';
import { S3File, type S3FileProps } from './s3-file';
import type { StringValue } from 'ms';

const pump = promisify(pipeline);

export type S3StreamProps = S3FileProps & {
    maxUploadFileSizeRestriction?: ByteUnitStringValue;
};

export class S3Stream extends S3File {
    private readonly maxUploadFileSizeRestriction: ByteUnitStringValue;

    constructor({ maxUploadFileSizeRestriction = '10GB', ...props }: S3StreamProps) {
        super(props);
        this.maxUploadFileSizeRestriction = maxUploadFileSizeRestriction;
    }

    async getObjectFileStream(
        fileKey: string,
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
        let normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

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

    protected async streamVideoFile(
        fileKey: string,
        {
            Range,
            abortSignal,
        }: {
            Range?: string;
            abortSignal?: AbortSignal;
        } = {}
    ): Promise<{
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
        let normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        try {
            const cmd = new GetObjectCommand({
                Bucket: this.bucket,
                Key: normalizedKey,
                ...(Range ? { Range } : {}),
            });

            const data: GetObjectCommandOutput = await this.execute(cmd, { abortSignal });

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
            this.logger?.warn(this.reqId, 'streamVideoFile error', {
                Bucket: this.bucket,
                fileKey: normalizedKey,
                Range,
                error,
            });
            return null;
        }
    }

    async streamVideoFileCtrl({
        allowedWhitelist,
        bufferMB = 5,
        contentType,
        fileKey: _fileKey,
        queryField = 'file',
        paramsField = 'file',
        headerField = 'x-fileKey',
        streamTimeoutMS = 30_000,
    }: {
        allowedWhitelist?: string[];
        bufferMB?: number | undefined;
        contentType?: string;
        fileKey?: string;
        queryField?: string;
        paramsField?: string;
        headerField?: string;
        streamTimeoutMS?: number | undefined;
    } = {}) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            let fileKey =
                _fileKey ||
                (req.params?.[paramsField] ? (req.params?.[paramsField] as string) : undefined) ||
                (req.query?.[queryField] ? (req.query?.[queryField] as string) : undefined);
            req.headers?.[headerField] ? (req.headers?.[headerField] as string) : undefined;

            if (!fileKey || fileKey === '/') {
                this.logger?.warn(req.id, 'fileKey video stream is required');
                next(Error('fileKey video stream is required'));
                return;
            }

            let normalizedKey = getNormalizedPath(fileKey);
            if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
            let Range: string;
            let fileSize: number;

            try {
                const fileInfo = await this.fileInfo(normalizedKey);
                if (!fileInfo) {
                    next(Error(`File does not exist: "${normalizedKey}"`));
                    return;
                }

                fileSize = getUnitBytes(fileInfo.ContentLength as number);

                if (req.method === 'HEAD') {
                    res.setHeader('Content-Type', fileInfo.ContentType);
                    res.setHeader('Accept-Ranges', 'bytes');
                    if (fileSize) res.setHeader('Content-Length', String(fileSize));
                    return res.status(200).end();
                }

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
                const result = await this.streamVideoFile(normalizedKey, {
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

                const finalContentType = contentType?.startsWith('video/')
                    ? contentType
                    : `video/${contentType || 'mp4'}`;

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

    streamImageFileCtrl = ({
        fileKey: _fileKey,
        queryField = 'file',
        paramsField = 'file',
        headerField = 'x-fileKey',
        cachingAge: _cachingAge = '1y',
    }: {
        fileKey?: string;
        queryField?: string;
        paramsField?: string;
        headerField?: string;
        cachingAge?: null | number | StringValue;
    } = {}) => {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            let fileKey =
                _fileKey ||
                (req.params?.[paramsField] ? decodeURIComponent(req.params?.[paramsField] as string) : undefined) ||
                (req.query?.[queryField] ? decodeURIComponent(req.query?.[queryField] as string) : undefined) ||
                (req.headers?.[headerField] ? decodeURIComponent(req.headers?.[headerField] as string) : undefined);

            if (!fileKey || fileKey === '/') {
                this.logger?.warn(req.id, 'image fileKey is required');
                next(Error('image fileKey is required'));
                return;
            }

            try {
                const imageBuffer = await this.fileContent(fileKey, 'buffer');
                const ext = extname(fileKey).slice(1).toLowerCase();

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
                res.setHeader('Content-Length', imageBuffer.length);

                const cachingAge =
                    !_cachingAge || typeof _cachingAge === 'number'
                        ? _cachingAge
                        : getTotalSeconds(_cachingAge as StringValue);

                if (cachingAge) {
                    res.setHeader('Cache-Control', `public, max-age=${cachingAge}`);
                }

                res.status(200).send(imageBuffer);
            } catch (error: any) {
                this.logger?.warn(req.id, 'image fileKey not found', {
                    fileKey,
                    ...(this.localstack && { localstack: this.localstack }),
                });
                next(Error(`Failed to retrieve image file: ${error.message}`));
            }
        };
    };

    streamBufferFileCtrl = ({
        fileKey: _fileKey,
        filename: _filename,
        queryField = 'file',
        paramsField = 'file',
        headerField = 'x-fileKey',
        cachingAge: _cachingAge = '1h',
    }: {
        fileKey?: string;
        filename?: string;
        queryField?: string;
        paramsField?: string;
        headerField?: string;
        cachingAge?: null | number | StringValue;
    } = {}) => {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            let fileKey =
                _fileKey ||
                (req.params?.[paramsField] ? decodeURIComponent(req.params?.[paramsField] as string) : undefined) ||
                (req.query?.[queryField] ? decodeURIComponent(req.query?.[queryField] as string) : undefined) ||
                (req.headers?.[headerField] ? decodeURIComponent(req.headers?.[headerField] as string) : undefined);

            if (!fileKey) {
                this.logger?.warn(req.id, 'iframe fileKey is required');
                next(Error('iframe fileKey is required'));
                return;
            }

            try {
                // if (this.localstack && !fileKey.includes('/')) fileKey = `/${fileKey}`;
                const fileBuffer = await this.fileContent(fileKey, 'buffer');
                const ext = extname(fileKey).slice(1).toLowerCase();

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

                const filename = _filename || basename(fileKey);
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
                res.setHeader('Content-Length', String(fileBuffer.length));

                const cachingAge =
                    !_cachingAge || typeof _cachingAge === 'number'
                        ? _cachingAge
                        : getTotalSeconds(_cachingAge as StringValue);

                if (cachingAge) {
                    res.setHeader('Cache-Control', `public, max-age=${cachingAge}`);
                }

                res.status(200).send(fileBuffer);
            } catch (error: any) {
                this.logger?.warn(req.id, 'pdf fileKey not found', {
                    fileKey,
                    ...(this.localstack && { localstack: this.localstack }),
                });
                next(Error(`Failed to retrieve pdf file: ${error.message}`));
            }
        };
    };

    async streamFileCtrl({
        fileKey: _fileKey,
        filename,
        forDownloading = false,
        paramsField = 'file',
        queryField = 'file',
        headerField = 'x-fileKey',
        streamMethod,
        cachingAge: _cachingAge = '1h',
    }: {
        fileKey?: string;
        filename?: string;
        forDownloading?: boolean;
        paramsField?: string;
        queryField?: string;
        headerField?: string;
        cachingAge?: null | number | StringValue;
        streamMethod?: 'pipe' | 'pipeline';
    } = {}) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            const fileKey =
                _fileKey ||
                (req.params?.[paramsField] ? (req.params?.[paramsField] as string) : undefined) ||
                (req.query?.[queryField] ? (req.query?.[queryField] as string) : undefined) ||
                (req.headers?.[headerField] ? decodeURIComponent(req.headers?.[headerField] as string) : undefined);

            if (!fileKey || fileKey === '/') {
                this.logger?.warn(req.id, 'fileKey stream is required');
                next(Error('fileKey stream is required'));
                return;
            }

            const abort = new AbortController();
            let stream: Readable | null = null;

            const onClose = () => {
                abort.abort();
                stream?.destroy?.();
            };

            req.once('close', onClose);

            let normalizedKey = getNormalizedPath(fileKey);
            if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

            try {
                const isExists = await this.fileExists(normalizedKey);
                if (!isExists) {
                    req.off('close', onClose);
                    next(Error(`File not found: "${normalizedKey}"`));
                    return;
                }

                stream = await this.getObjectFileStream(normalizedKey, {
                    abortSignal: abort.signal,
                    checkFileExists: false,
                });

                if (!stream) {
                    req.off('close', onClose);
                    next(Error(`Failed to get file stream: "${normalizedKey}"`));
                    return;
                }

                const fileInfo = await this.fileInfo(normalizedKey);
                const contentType = fileInfo.ContentType || 'application/octet-stream';
                const ext = extname(fileKey).slice(1).toLowerCase();
                const fileName = filename || normalizedKey.split('/').pop() || `${Date.now()}.${ext}`;

                // Determine if the file can be displayed inline (e.g., in iframe)
                const inlineTypes = ['text/', 'image/', 'application/pdf', 'video/', 'audio/'];
                const canDisplayInline =
                    SUPPORTED_IFRAME_EXTENSIONS.includes(ext) ||
                    inlineTypes.some((type) => contentType.startsWith(type));

                const shouldIncludeCharSet =
                    contentType.startsWith('text/') ||
                    contentType === 'application/json' ||
                    contentType === 'application/xml' ||
                    contentType === 'application/javascript' ||
                    contentType === 'application/xhtml+xml';

                if (shouldIncludeCharSet) {
                    res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
                    stream.setEncoding('utf8');
                } else {
                    res.setHeader('Content-Type', contentType);
                }

                if (fileInfo.ContentLength) {
                    res.setHeader('Content-Length', String(fileInfo.ContentLength));
                }

                if (forDownloading || !canDisplayInline) {
                    // Force download
                    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
                } else {
                    // Display inline (e.g., in iframe) but still provide filename
                    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
                }

                const cachingAge =
                    !_cachingAge || typeof _cachingAge === 'number'
                        ? _cachingAge
                        : getTotalSeconds(_cachingAge as StringValue);

                if (cachingAge) {
                    res.setHeader('Cache-Control', `public, max-age=${cachingAge}`);
                }

                res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition, Content-Length');

                stream.on('error', (err) => {
                    this.logger?.warn(this.reqId, 'Stream error', { fileKey: normalizedKey, error: err });
                    abort.abort();
                    stream?.destroy?.();
                });

                res.once('close', () => {
                    stream?.destroy?.();
                    req.off('close', onClose);
                });

                streamMethod ||= canDisplayInline ? 'pipe' : 'pipeline';

                if (streamMethod === 'pipeline') {
                    await pump(stream, res);
                } else {
                    stream.pipe(res);
                }

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

                this.logger?.error(this.reqId, 'Failed to stream file', { fileKey: normalizedKey, error });

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

    async streamZipFileCtr({
        fileKey: _fileKey,
        filename: _filename,
        queryField = 'file',
        paramsField = 'file',
        headerField = 'x-fileKey',
        compressionLevel = 5,
    }: {
        filename?: string;
        compressionLevel?: number; // Compression level (0-9, lower = faster)
        fileKey?: string | string[];
        queryField?: string;
        paramsField?: string;
        headerField?: string;
    } = {}) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            const abort = new AbortController();
            const onClose = () => abort.abort();

            try {
                let fileKey =
                    _fileKey ||
                    (req.params?.[paramsField] ? (req.params?.[paramsField] as string) : undefined) ||
                    (req.query?.[queryField] ? (req.query?.[queryField] as string) : undefined) ||
                    (req.headers?.[headerField] ? decodeURIComponent(req.headers?.[headerField] as string) : undefined);

                if (!fileKey || fileKey === '/') {
                    this.logger?.warn(req.id, 'fileKey video stream is required');
                    next(Error('fileKey video stream is required'));
                    return;
                }

                const fileKeys = ([] as string[])
                    .concat(fileKey as string[])
                    .map((fileKey) => getNormalizedPath(fileKey))
                    .filter((v) => v && v !== '/');

                if (!fileKeys.length) {
                    throw new Error('No file keys provided');
                }

                let filename = _filename || new Date().toISOString();
                filename = filename.endsWith('.zip') ? filename : `${filename}.zip`;

                req.once('close', onClose);

                this.logger?.info(this.reqId, 'Starting parallel file download...', { fileCount: fileKeys.length });

                const downloadPromises = fileKeys.map(async (fileKey) => {
                    try {
                        if (abort.signal.aborted) return null;

                        const stream = await this.getObjectFileStream(fileKey, { abortSignal: abort.signal });

                        if (!stream) {
                            this.logger?.warn(this.reqId, 'File not found', { fileKey });
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
                        const fileName = fileKey.split('/').pop() || fileKey;

                        this.logger?.debug(this.reqId, 'File downloaded', {
                            fileKey,
                            sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
                        });

                        return { buffer, name: fileName, path: fileKey };
                    } catch (error) {
                        this.logger?.warn(this.reqId, 'Failed to download file', { fileKey, error });
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
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
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

    private static fileFilter(types?: FILE_TYPE[], fileExt?: FILE_EXT[]) {
        const fileTypesChecker = fileExt?.length ? new RegExp(`\\.(${fileExt.join('|')})$`, 'i') : undefined;

        return function (_req: Request, file: File, cb: multer.FileFilterCallback) {
            const fileExtension = extname(file.originalname).substring(1); // Remove the dot
            const ext = fileTypesChecker ? fileTypesChecker.test(`.${fileExtension}`) : true;
            const mimeType = types?.length ? types.some((type) => file.mimetype.startsWith(`${type}/`)) : true;

            if (mimeType && ext) {
                return cb(null, true);
            }

            const errorMsg = !ext
                ? `Upload File Ext Error: Allowed extensions: [${fileExt?.join(', ')}]. Got: ${fileExtension}`
                : `Upload File Type Error: Allowed types: [${types?.join(', ')}]. Got: ${file.mimetype}`;

            return cb(new Error(errorMsg));
        };
    }

    protected getUploadFileMW(
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
                    // Decode the original filename once
                    const originalName = decodeURIComponent(file.originalname);

                    const baseMetadata: FILES3_METADATA = {
                        ...file,
                        directory: normalizedPath,
                        // Encode non-ASCII characters for S3 metadata
                        originalname: encodeS3Metadata(originalName),
                        // Optional: Add a flag to know it's encoded
                        // @ts-ignore
                        'originalname-encoded': hasNonAscii(originalName) ? 'base64' : 'plain',
                    };

                    if (customMetadata) {
                        const additionalMetadata =
                            typeof customMetadata === 'function' ? await customMetadata(req, file) : customMetadata;

                        // Sanitize all custom metadata values
                        const sanitizedMetadata: Record<string, string> = {};
                        for (const [key, value] of Object.entries(additionalMetadata)) {
                            sanitizedMetadata[key] =
                                typeof value === 'string' ? encodeS3Metadata(value) : String(value);
                        }

                        Object.assign(baseMetadata, sanitizedMetadata);
                    }

                    cb(null, baseMetadata);
                },
                key: async (req: Request & any, file: File, cb: Function) => {
                    let filename: string;
                    file.originalname = decodeURIComponent(file.originalname);

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
    uploadSingleFileMW(fieldName: string, directoryPath: string, options: S3UploadOptions = {}) {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

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
    uploadMultipleFilesMW(
        fieldName: string,
        directoryPath: string,
        { maxFilesCount, ...options }: S3UploadOptions & { maxFilesCount?: undefined | number | null } = {}
    ) {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        const upload = this.getUploadFileMW(normalizedPath, options);

        return (req: Request & { s3Files?: UploadedS3File[] } & any, res: Response, next: NextFunction & any) => {
            const mw: RequestHandler & any = upload.array(fieldName, maxFilesCount || undefined);
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
     * Middleware for uploading any files (mixed field names)
     * Adds the uploaded files info to req.s3AllFiles
     */
    uploadAnyFilesMW(directoryPath: string, maxCount?: number, options: S3UploadOptions = {}): RequestHandler {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && normalizedPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

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

    /**
     * Middleware for uploading multiple files with different field names
     * Adds the uploaded files info to req.s3FilesByField
     */
    /*
    example
    uploadFieldsFiles([
        { name: 'cardPosterSrc', maxCount: 1 },
        { name: 'sectionPosterSrc', maxCount: 1 },
        { name: 'imageSrc', maxCount: 1 },
    ]) as any,
    */
    // uploadFieldsFiles(
    //     fields: Array<{ name: string; directory: string; maxCount?: number; options?: S3UploadOptions }>
    // ): RequestHandler {
    //     // Create separate multer instances for each field (since each might have different options)
    //     const fieldConfigs = fields.map((field) => {
    //         const upload = this.getUploadFileMW(field.directory, field.options || {});
    //
    //         return {
    //             name: getNormalizedPath(field.name),
    //             directory: getNormalizedPath(field.directory),
    //             maxCount: field.maxCount || 1,
    //             upload,
    //         };
    //     });
    //
    //     return async (
    //         req: Request & { s3FilesByField?: Record<string, UploadedS3File[]> } & any,
    //         res: Response,
    //         next: NextFunction & any
    //     ) => {
    //         // We'll use the first upload instance but with fields configuration
    //         const multerFields = fieldConfigs.map((f) => ({ name: f.name, maxCount: f.maxCount }));
    //         const upload = this.getUploadFileMW(fieldConfigs[0].directory);
    //
    //         const mw: RequestHandler & any = upload.fields(multerFields);
    //         mw(req, res, (err: any) => {
    //             if (err) {
    //                 this.logger?.error(this.reqId, 'Fields upload error', { error: err.message });
    //                 return next(err);
    //             }
    //
    //             if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
    //                 req.s3FilesByField = req.files as Record<string, UploadedS3File[]>;
    //
    //                 const uploadSummary = Object.entries(req.s3FilesByField).map(([field, files]: any) => ({
    //                     field,
    //                     count: files.length,
    //                     keys: files.map((f: any) => f.key),
    //                 }));
    //
    //                 this.logger?.info(this.reqId, 'Fields uploaded successfully', { uploadSummary });
    //             }
    //
    //             next();
    //         });
    //     };
    // }
}
