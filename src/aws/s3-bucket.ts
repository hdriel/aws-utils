import type { Response, Request, NextFunction } from 'express';
import ms, { type StringValue } from 'ms';
import http from 'http';
import https from 'https';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Buffer } from 'buffer';
import archiver from 'archiver';
import { Readable } from 'node:stream';
import {
    CreateBucketCommand,
    GetObjectCommand,
    type GetObjectCommandOutput,
    S3Client,
    type CreateBucketCommandInput,
    type DeleteBucketCommandInput,
    type DeleteBucketCommandOutput,
    DeleteBucketCommand,
    HeadBucketCommand,
    PutPublicAccessBlockCommand,
    PutBucketPolicyCommand,
    type CreateBucketCommandOutput,
    ListBucketsCommand,
    type ListBucketsCommandInput,
    PutObjectCommand,
    HeadObjectCommand,
    ListObjectsCommand,
    PutObjectTaggingCommand,
    GetObjectTaggingCommand,
    DeleteObjectCommand,
    type ServiceOutputTypes,
    type Bucket,
    type ListBucketsCommandOutput,
    type HeadBucketCommandOutput,
    type PutObjectCommandOutput,
    type HeadObjectCommandOutput,
    type ListObjectsCommandOutput,
    type PutObjectTaggingCommandOutput,
    type GetObjectTaggingCommandOutput,
    type DeleteObjectCommandOutput,
    type PutPublicAccessBlockCommandOutput,
    type PutBucketPolicyCommandOutput,
} from '@aws-sdk/client-s3';

import { logger } from '../utils/logger';
import { ACLs } from '../utils/consts';
import { s3Limiter } from '../utils/concurrency';

import type { ContentFile, FileUploadResponse } from '../interfaces';
import { AWSConfigSharingUtil } from './configuration.ts';

const pump = promisify(pipeline);

export class S3BucketUtil {
    public readonly s3Client: S3Client;

    public readonly bucket: string;

    public readonly endpoint: string;

    public readonly region: string;

    public readonly reqId: string | null;

    constructor({
        bucket,
        reqId,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
    }: {
        bucket: string;
        reqId?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        region?: string;
        s3ForcePathStyle?: boolean;
    }) {
        const credentials = { accessKeyId, secretAccessKey };
        const options = {
            ...(accessKeyId && secretAccessKey && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        };
        this.endpoint = endpoint;
        this.region = region;
        this.bucket = bucket;
        this.reqId = reqId ?? null;

        const s3ClientParams = {
            ...options,
            ...(s3ForcePathStyle && { forcePathStyle: s3ForcePathStyle }),
            requestHandler: new NodeHttpHandler({
                httpAgent: new http.Agent({ keepAlive: true, maxSockets: 300 }),
                httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 300 }),
                connectionTimeout: 3000,
                socketTimeout: 30000,
            }),
        };
        this.s3Client = new S3Client(s3ClientParams);
    }

    get link(): string {
        return this.endpoint === 'http://localhost:4566'
            ? `${this.endpoint}/${this.bucket}/`
            : `https://s3.${this.region}.amazonaws.com/${this.bucket}/`;
    }

    private async execute<T = ServiceOutputTypes>(command: any, options?: any): Promise<T> {
        // @ts-ignore
        return this.s3Client.send(command, options);
    }

    // todo: move to s3Utils
    async getBucketList(options: Partial<ListBucketsCommandInput> = {}): Promise<Bucket[]> {
        const command = new ListBucketsCommand(options);
        const response = await this.execute<ListBucketsCommandOutput>(command);

        return response?.Buckets || [];
    }

    async isExistsBucket(): Promise<boolean> {
        const bucketName = this.bucket;

        try {
            await this.execute<HeadBucketCommandOutput>(new HeadBucketCommand({ Bucket: bucketName }));
            return true;
        } catch (err: any) {
            if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
                logger.error(this.reqId, 'Error checking bucket:', err);
                throw err;
            } else {
                return false;
            }
        }
    }

    private async initAsPublicBucket(): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isExistsBucket();
        if (isExists) {
            logger.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const data = await this.execute(new CreateBucketCommand({ Bucket: bucketName }));
        CREATE_PUBLICK_ACCESS_BLOCK: {
            const command = new PutPublicAccessBlockCommand({
                Bucket: bucketName,
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: false,
                    IgnorePublicAcls: false,
                    BlockPublicPolicy: false,
                    RestrictPublicBuckets: false,
                },
            });
            await this.execute<PutPublicAccessBlockCommandOutput>(command);
        }

        UPDATE_PUBLICK_ACCESS_POLICY: {
            const policy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Sid: 'PublicReadGetObject',
                        Effect: 'Allow',
                        Principal: '*',
                        Action: 's3:GetObject',
                        Resource: `arn:aws:s3:::${bucketName}/*`,
                    },
                ],
            };

            const command = new PutBucketPolicyCommand({ Bucket: bucketName, Policy: JSON.stringify(policy) });
            await this.execute<PutBucketPolicyCommandOutput>(command);
        }

        logger.info(this.reqId, `Public bucket created successfully.`, { bucketName });

        return data;
    }

    private async initAsPrivateBucket(
        includeConstraintLocation?: boolean
    ): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isExistsBucket();
        if (isExists) {
            logger.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const createParams: CreateBucketCommandInput = {
            Bucket: bucketName,
            ...(includeConstraintLocation && {
                CreateBucketConfiguration: { LocationConstraint: this.region as any },
            }),
        };

        const data = await this.execute(new CreateBucketCommand(createParams));
        logger.info(this.reqId, `Private bucket created successfully.`, { bucketName });

        return data;
    }

    async initBucket(
        acl: ACLs = ACLs.private,
        includeConstraintLocation = false
    ): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isExistsBucket();
        if (isExists) {
            logger.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const data =
            acl === ACLs.private
                ? await this.initAsPrivateBucket(includeConstraintLocation)
                : await this.initAsPublicBucket();

        return data;
    }

    async destroyBucket(): Promise<DeleteBucketCommandOutput | undefined> {
        // todo add emptyBucketFromAllFiles first
        const bucketName = this.bucket;

        const isExists = await this.isExistsBucket();
        if (!isExists) {
            logger.debug(this.reqId, `Bucket not exists.`, { bucketName });
            return;
        }

        const createParams: DeleteBucketCommandInput = { Bucket: bucketName };
        const data = await this.execute(new DeleteBucketCommand(createParams));

        return data;
    }

    async createBucketDirectory(directoryPath: string): Promise<PutObjectCommandOutput> {
        const command = new PutObjectCommand({ Bucket: this.bucket, Key: directoryPath });

        return await this.execute<PutObjectCommandOutput>(command);
    }

    async getFileInfo(filePath: string): Promise<HeadObjectCommandOutput> {
        const command = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        return await this.execute<HeadObjectCommandOutput>(command);
    }

    async getDirectoryFilesListInfo(
        directoryPath?: string,
        fileNamePrefix?: string
    ): Promise<Array<ContentFile & { key: string }>> {
        const prefix = [directoryPath, fileNamePrefix].filter((v) => v).join('/');

        const command = new ListObjectsCommand({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: '/',
        });

        const result = await this.execute<ListObjectsCommandOutput>(command);

        return (result.Contents?.map((content: any) => ({
            ...content,
            key: content.Key.replace(prefix, ''),
            LastModified: new Date(content.LastModified),
        })) ?? []) as Array<ContentFile & { key: string }>;
    }

    async getObjectStreamByChecking(filePath: string, { Range }: { Range?: string } = {}): Promise<Readable | null> {
        const isExists = await this.fileExists(filePath);
        if (!isExists) return null;

        return this.getObjectStream(filePath, { Range });
    }

    async getObjectStream(
        filePath: string,
        { Range, checkExists }: { Range?: string; checkExists?: boolean } = {}
    ): Promise<Readable | null> {
        if (checkExists) {
            const isExists = await this.fileExists(filePath);
            if (!isExists) return null;
        }

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
            ...(Range ? { Range } : {}),
        });

        const response = await this.execute<GetObjectCommandOutput>(command);

        if (!response.Body || !(response.Body instanceof Readable)) {
            throw new Error('Invalid response body: not a Readable stream');
        }

        return response.Body as Readable;
    }

    async taggingFile(filePath: string, tagVersion: string = '1.0.0'): Promise<boolean> {
        try {
            const command = new PutObjectTaggingCommand({
                Bucket: this.bucket,
                Key: filePath,
                Tagging: { TagSet: [{ Key: 'version', Value: tagVersion }] },
            });

            await this.execute<PutObjectTaggingCommandOutput>(command);

            return true;
        } catch {
            return false;
        }
    }

    async getFileVersion(filePath: string): Promise<string> {
        const command = new GetObjectTaggingCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        const result = await this.execute<GetObjectTaggingCommandOutput>(command);

        const tag = result.TagSet?.find((tag) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async generateSignedFileUrl(filePath: string, expiresIn: number | StringValue = '15m'): Promise<string> {
        const expiresInSeconds = typeof expiresIn === 'number' ? expiresIn : ms(expiresIn) / 1000;

        const command = new GetObjectCommand({ Bucket: this.bucket, Key: filePath });
        const url = await getSignedUrl(this.s3Client, command, {
            expiresIn: expiresInSeconds, // is using 3600 it's will expire in 1 hour (default is 900 seconds = 15 minutes)
        });

        return url;
    }

    async sizeOf(filePath: string, unit: 'bytes' | 'KB' | 'MB' | 'GB' = 'bytes'): Promise<number> {
        try {
            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: filePath });
            const headObject = await this.execute<HeadObjectCommandOutput>(command);
            const bytes = headObject.ContentLength ?? 0;

            switch (unit) {
                case 'KB':
                    return bytes / 1024;
                case 'MB':
                    return bytes / (1024 * 1024);
                case 'GB':
                    return bytes / (1024 * 1024 * 1024);
                default:
                    return bytes;
            }
        } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                logger.warn(this.reqId, 'File not found', { filePath });
                return 0;
            }
            throw error;
        }
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: filePath });
            await this.execute<HeadObjectCommandOutput>(command);

            return true;
        } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }

            throw error;
        }
    }

    async fileContent(filePath: string, format: 'buffer' | 'base64' | 'utf8' = 'buffer'): Promise<Buffer | string> {
        const command = new GetObjectCommand({ Bucket: this.bucket, Key: filePath });
        const result = await this.execute<GetObjectCommandOutput>(command);

        if (!result.Body) {
            throw new Error('File body is empty');
        }

        const stream = result.Body as Readable;
        const chunks: Uint8Array[] = [];

        for await (const chunk of stream) {
            chunks.push(chunk as Uint8Array);
        }

        const buffer = Buffer.concat(chunks);

        if (format === 'base64' || format === 'utf8') {
            return buffer.toString(format);
        }

        return buffer;
    }

    async uploadFile(
        filePath: string,
        fileData: Buffer | Readable | string | Uint8Array,
        acl: ACLs = ACLs.private,
        version: string = '1.0.0'
    ): Promise<FileUploadResponse & { test: string }> {
        const upload = new Upload({
            client: this.s3Client,
            params: {
                Bucket: this.bucket,
                ACL: acl,
                Key: filePath,
                Body: fileData,
                Tagging: `version=${version}`,
            },
        });

        const result = await upload.done();

        return {
            Bucket: this.bucket,
            Key: filePath,
            Location: `https://${this.bucket}.s3.amazonaws.com/${filePath}`,
            test: `${this.link}/${filePath}`,
            ETag: result.ETag as string,
        };
    }

    async deleteFile(filePath: string): Promise<DeleteObjectCommandOutput> {
        const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: filePath });
        return await this.execute<DeleteObjectCommandOutput>(command);
    }

    async streamZipFile(filePath: string | string[], res: Response & any): Promise<void> {
        const filePaths = ([] as string[]).concat(filePath as string[]);
        const archive = archiver('zip');

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="files.zip"');
        archive.pipe(res as NodeJS.WritableStream);

        for (const filePath of filePaths) {
            try {
                const fileName = filePath.split('/').pop() || filePath;
                const stream = await this.getObjectStream(filePath);
                if (!stream) {
                    throw Error('File not found');
                }

                archive.append(stream, { name: fileName });
            } catch (error) {
                logger.warn(this.reqId, 'Failed to add file to zip', { filePath, error });
            }
        }

        await archive.finalize();
    }

    async streamVideoFile({
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
        try {
            const cmd = new GetObjectCommand({
                Bucket: this.bucket,
                Key: filePath,
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
            logger.warn(this.reqId, 'getS3VideoStream error', { Bucket: this.bucket, filePath, Range, error });
            return null;
        }
    }

    async getStreamVideoFileCtrl({
        contentType = 'video/mp4',
        fileKey,
        Range,
        allowedWhitelist,
        streamTimeoutMS = 30_000,
    }: {
        contentType?: string;
        fileKey: string;
        allowedWhitelist?: string[];
        Range?: string | undefined;
        streamTimeoutMS: number | undefined;
    }) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            const filePath = fileKey;
            const isExists = await this.fileExists(filePath);
            const fileSize = await this.sizeOf(filePath);
            if (!isExists) {
                next(Error(`File does not exist: "${filePath}"`));
                return;
            }

            if (req.method === 'HEAD') {
                res.setHeader('Content-Type', contentType);
                res.setHeader('Accept-Ranges', 'bytes');
                if (fileSize) res.setHeader('Content-Length', String(fileSize));
                return res.status(200).end();
            }

            // הכנת AbortController לביטול בקשת S3 אם הלקוח נסגר
            const abort = new AbortController();
            const onClose = () => abort.abort();
            req.once('close', onClose);

            try {
                const result = await this.streamVideoFile({ filePath, Range, abortSignal: abort.signal });
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

                // Headers
                // if (Range) res.status(206); // Partial content

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
                    logger.warn(req.id, 'caught exception in stream controller', {
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
}
