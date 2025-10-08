import type { Response, Request, NextFunction } from 'express';
import type { Logger } from 'stack-trace-logger';
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
    ListObjectsV2Command,
    type ListObjectsV2CommandOutput,
    DeleteObjectsCommand,
    type DeleteObjectsCommandOutput,
} from '@aws-sdk/client-s3';
import { ACLs } from '../utils/consts';
import { s3Limiter } from '../utils/concurrency';

import type { ContentFile, FileUploadResponse } from '../interfaces';
import { AWSConfigSharingUtil } from './configuration';

const pump = promisify(pipeline);

const parseRangeHeader = (range: string | undefined, contentLength: number, chunkSize: number) => {
    if (!range || !range.startsWith('bytes=')) return null;
    const rangeParts = range.replace('bytes=', '').split('-');
    const start = parseInt(rangeParts[0], 10);
    let end = parseInt(rangeParts[1], 10);
    end = end || start + chunkSize - 1;

    if (isNaN(start) || start < 0 || start >= contentLength) return null;
    if (isNaN(end) || end < start || end >= contentLength) {
        return [start, contentLength - 1];
    }

    return [start, Math.min(end, end)];
};

export class S3BucketUtil {
    public readonly s3Client: S3Client;

    public readonly bucket: string;

    public readonly endpoint: string;

    public readonly region: string;

    public readonly logger?: Logger;

    public readonly reqId: string | null;

    constructor({
        logger,
        bucket,
        reqId,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
    }: {
        logger?: Logger;
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
        this.logger = logger;
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

    // ##### BUCKET BLOCK ##########################

    async getBucketList(options: Partial<ListBucketsCommandInput> = {}): Promise<Bucket[] | null> {
        const command = new ListBucketsCommand(options);
        const response = await this.execute<ListBucketsCommandOutput>(command);

        return response?.Buckets || null;
    }

    async isExistsBucket(): Promise<boolean> {
        const bucketName = this.bucket;

        try {
            await this.execute<HeadBucketCommandOutput>(new HeadBucketCommand({ Bucket: bucketName }));
            return true;
        } catch (err: any) {
            if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
                this.logger?.error(this.reqId, 'Error checking bucket:', err);
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
            this.logger?.info(this.reqId, `Bucket already exists.`, { bucketName });
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

        this.logger?.info(this.reqId, `Public bucket created successfully.`, { bucketName });

        return data;
    }

    private async initAsPrivateBucket(
        includeConstraintLocation?: boolean
    ): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isExistsBucket();
        if (isExists) {
            this.logger?.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const createParams: CreateBucketCommandInput = {
            Bucket: bucketName,
            ...(includeConstraintLocation && {
                CreateBucketConfiguration: { LocationConstraint: this.region as any },
            }),
        };

        const data = await this.execute(new CreateBucketCommand(createParams));
        this.logger?.info(this.reqId, `Private bucket created successfully.`, { bucketName });

        return data;
    }

    async initBucket(
        acl: ACLs = ACLs.private,
        includeConstraintLocation = false
    ): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isExistsBucket();
        if (isExists) {
            this.logger?.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const data =
            acl === ACLs.private
                ? await this.initAsPrivateBucket(includeConstraintLocation)
                : await this.initAsPublicBucket();

        return data;
    }

    private async emptyBucket() {
        let ContinuationToken: string | undefined = undefined;
        do {
            const listResp: ListObjectsV2CommandOutput = await this.execute<ListObjectsV2CommandOutput>(
                new ListObjectsV2Command({
                    Bucket: this.bucket,
                    ContinuationToken,
                })
            );

            if (listResp.Contents && listResp.Contents.length > 0) {
                await this.execute<DeleteObjectsCommandOutput>(
                    new DeleteObjectsCommand({
                        Bucket: this.bucket,
                        Delete: {
                            Objects: listResp.Contents.map((obj) => ({ Key: obj.Key! })),
                        },
                    })
                );
            }
            ContinuationToken = listResp.NextContinuationToken;
        } while (ContinuationToken);
    }

    async destroyBucket(
        forceDeleteAllFilesBeforeDestroyBucket = false
    ): Promise<DeleteBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isExistsBucket();
        if (!isExists) {
            this.logger?.debug(this.reqId, `Bucket not exists.`, { bucketName });
            return;
        }

        if (forceDeleteAllFilesBeforeDestroyBucket) {
            await this.emptyBucket();
        }

        const createParams: DeleteBucketCommandInput = { Bucket: bucketName };
        const data = await this.execute(new DeleteBucketCommand(createParams));

        return data;
    }

    // ##### DIRECTORY BLOCK ##########################

    async createDirectory(directoryPath: string): Promise<PutObjectCommandOutput> {
        const normalizedPath = directoryPath ? (directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`) : '';
        const command = new PutObjectCommand({ Bucket: this.bucket, Key: normalizedPath });

        return await this.execute<PutObjectCommandOutput>(command);
    }

    async deleteDirectory(directoryPath: string): Promise<DeleteObjectsCommandOutput | null> {
        const normalizedPath = directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`;

        let totalDeletedCount = 0;
        let ContinuationToken: string | undefined = undefined;

        do {
            const listResp: ListObjectsV2CommandOutput = await this.execute<ListObjectsV2CommandOutput>(
                new ListObjectsV2Command({
                    Bucket: this.bucket,
                    Prefix: normalizedPath,
                    ContinuationToken,
                })
            );

            if (listResp.Contents && listResp.Contents.length > 0) {
                const deleteResult = await this.execute<DeleteObjectsCommandOutput>(
                    new DeleteObjectsCommand({
                        Bucket: this.bucket,
                        Delete: {
                            Objects: listResp.Contents.map((obj) => ({ Key: obj.Key! })),
                            Quiet: false,
                        },
                    })
                );

                totalDeletedCount += deleteResult.Deleted?.length ?? 0;

                if (deleteResult.Errors && deleteResult.Errors.length > 0) {
                    this.logger?.warn(this.reqId, `Some objects failed to delete`, {
                        directoryPath: normalizedPath,
                        errors: deleteResult.Errors,
                    });
                }
            }

            ContinuationToken = listResp.NextContinuationToken;
        } while (ContinuationToken);

        if (totalDeletedCount === 0) {
            const directoryExists = await this.fileExists(normalizedPath);
            if (!directoryExists) {
                this.logger?.debug(this.reqId, `Directory not found`, { directoryPath: normalizedPath });
                return null;
            }
        }

        try {
            await this.execute<DeleteObjectCommandOutput>(
                new DeleteObjectCommand({
                    Bucket: this.bucket,
                    Key: normalizedPath,
                })
            );
            totalDeletedCount++;
        } catch (error: any) {
            if (error.name !== 'NotFound' && error.$metadata?.httpStatusCode !== 404) {
                this.logger?.warn(this.reqId, `Failed to delete directory marker`, {
                    directoryPath: normalizedPath,
                    error,
                });
            }
        }

        this.logger?.info(this.reqId, `Directory deleted successfully`, {
            directoryPath: normalizedPath,
            deletedCount: totalDeletedCount,
        });

        return {
            Deleted: [{ Key: normalizedPath }],
            $metadata: {},
        } as DeleteObjectsCommandOutput;
    }

    async directoryList(directoryPath?: string): Promise<{
        directories: string[];
        files: ContentFile[];
    }> {
        const normalizedPath = directoryPath ? (directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`) : '';

        const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: normalizedPath,
            Delimiter: '/',
        });

        const result = await this.execute<ListObjectsV2CommandOutput>(command);

        // Extract directories (CommonPrefixes)
        const directories = (result.CommonPrefixes || [])
            .map((prefix) => prefix.Prefix!)
            .map((prefix) => {
                // Remove the base path and trailing slash to get just the directory name
                const relativePath = prefix.replace(normalizedPath, '');
                return relativePath.endsWith('/') ? relativePath.slice(0, -1) : relativePath;
            })
            .filter((dir) => dir); // Remove empty strings

        // Extract files (Contents)
        const files = (result.Contents || ([] as ContentFile[]))
            .filter((content) => {
                // Filter out the directory marker itself (empty file with trailing /)
                return content.Key !== normalizedPath && !content.Key?.endsWith('/');
            })
            .map((content: any) => ({
                ...content,
                Name: content.Key.replace(normalizedPath, ''),
                LastModified: new Date(content.LastModified),
            }))
            .filter((content) => content.Name);

        return { directories, files };
    }

    /**
     * Get all files recursively (example for search/indexing)
     * @param directoryPath
     */
    async directoryListRecursive(directoryPath?: string): Promise<{
        directories: string[];
        files: Array<ContentFile & { key: string; fullPath: string }>;
    }> {
        const normalizedPath = directoryPath ? (directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`) : '';

        const allDirectories: string[] = [];
        const allFiles: Array<ContentFile & { key: string; fullPath: string }> = [];
        let ContinuationToken: string | undefined = undefined;

        do {
            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: normalizedPath,
                ContinuationToken,
                // No Delimiter - to get all nested items
            });

            const result: any = await this.execute<ListObjectsV2CommandOutput>(command);

            if (result.Contents) {
                for (const content of result.Contents) {
                    const fullPath = content.Key!;
                    const relativePath = fullPath.replace(normalizedPath, '');

                    // If it ends with /, it's a directory marker
                    if (fullPath.endsWith('/')) {
                        allDirectories.push(relativePath.slice(0, -1)); // Remove trailing /
                    } else {
                        // It's a file
                        allFiles.push({
                            ...content,
                            key: relativePath,
                            fullPath: fullPath,
                            LastModified: new Date(content.LastModified),
                        } as ContentFile & { key: string; fullPath: string });
                    }
                }
            }

            ContinuationToken = result.NextContinuationToken;
        } while (ContinuationToken);

        return {
            directories: allDirectories,
            files: allFiles,
        };
    }

    /**
     * Get tree files recursively (example for build file explorer UI)
     * @param directoryPath - the directory start from
     * @example
     * const tree = await s3Util.getDirectoryTree('uploads');
     * // {
     * //   name: 'uploads',
     * //   path: 'uploads/',
     * //   type: 'directory',
     * //   children: [
     * //     {
     * //       name: 'logo.png',
     * //       path: 'uploads/logo.png',
     * //       type: 'file',
     * //       size: 12345,
     * //       lastModified: Date
     * //     },
     * //     {
     * //       name: 'images',
     * //       path: 'uploads/images/',
     * //       type: 'directory',
     * //       children: [
     * //         { name: 'photo1.jpg', type: 'file', ... },
     * //         { name: 'photo2.jpg', type: 'file', ... }
     * //       ]
     * //     }
     * //   ]
     * // }
     */
    async directoryTree(directoryPath?: string): Promise<{
        name: string;
        path: string;
        type: 'directory' | 'file';
        size?: number;
        lastModified?: Date;
        children?: Array<any>;
    }> {
        const normalizedPath = directoryPath ? (directoryPath.endsWith('/') ? directoryPath : `${directoryPath}/`) : '';
        const directory = directoryPath?.split('/').pop();

        const { directories, files } = await this.directoryList(directoryPath);

        const tree: any = {
            name: directory || 'root',
            path: normalizedPath,
            type: 'directory',
            children: [],
        };

        // Add files
        for (const file of files) {
            tree.children.push({
                name: file.Name,
                path: normalizedPath + file.Name,
                type: 'file',
                size: file.Size,
                lastModified: file.LastModified,
            });
        }

        // Add directories (recursively)
        for (const dir of directories) {
            const subPath = normalizedPath + dir;
            const subTree = await this.directoryTree(subPath);
            tree.children.push(subTree);
        }

        return tree;
    }

    // ##### FILES BLOCK ##########################

    async fileInfo(filePath: string): Promise<HeadObjectCommandOutput> {
        const command = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        return await this.execute<HeadObjectCommandOutput>(command);
    }

    async fileListInfo(directoryPath?: string, fileNamePrefix?: string): Promise<ContentFile[]> {
        const directoryPrefix = directoryPath?.endsWith('/') ? directoryPath : directoryPath ? `${directoryPath}/` : '';
        const prefix = directoryPrefix + (fileNamePrefix || '');

        const command = new ListObjectsCommand({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: '/',
        });

        const result = await this.execute<ListObjectsCommandOutput>(command);

        return (result.Contents ?? ([] as ContentFile[]))
            .map(
                (content: any) =>
                    ({
                        ...content,
                        Name: content.Key.replace(prefix, ''),
                        LastModified: new Date(content.LastModified),
                    }) as ContentFile
            )
            .filter((content) => content.Name);
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

    async fileVersion(filePath: string): Promise<string> {
        const command = new GetObjectTaggingCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        const result = await this.execute<GetObjectTaggingCommandOutput>(command);

        const tag = result.TagSet?.find((tag) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async fileUrl(filePath: string, expiresIn: number | StringValue = '15m'): Promise<string> {
        const expiresInSeconds = typeof expiresIn === 'number' ? expiresIn : ms(expiresIn) / 1000;

        const command = new GetObjectCommand({ Bucket: this.bucket, Key: filePath });
        const url = await getSignedUrl(this.s3Client, command, {
            expiresIn: expiresInSeconds, // is using 3600 it's will expire in 1 hour (default is 900 seconds = 15 minutes)
        });

        this.logger?.info(null, 'generate signed file url', { url, filePath, expiresIn });
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
                this.logger?.warn(this.reqId, 'File not found', { filePath });
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

    // ##### STREAMING BLOCK ##########################

    private async streamObjectFile(
        filePath: string,
        { Range, checkFileExists = true }: { Range?: string; checkFileExists?: boolean } = {}
    ): Promise<Readable | null> {
        if (checkFileExists) {
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

    private async streamVideoFile({
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
            this.logger?.warn(this.reqId, 'getS3VideoStream error', { Bucket: this.bucket, filePath, Range, error });
            return null;
        }
    }

    async getStreamZipFileCtr({ filePath, filename: _filename }: { filePath: string | string[]; filename?: string }) {
        return async (_req: Request & any, res: Response & any, next: NextFunction & any) => {
            const filePaths = ([] as string[]).concat(filePath as string[]);
            const archive = archiver('zip');
            const filename = _filename || new Date().toISOString();

            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.zip"`);
            archive.pipe(res as NodeJS.WritableStream);

            for (const filePath of filePaths) {
                try {
                    const fileName = filePath.split('/').pop() || filePath;
                    const stream = await this.streamObjectFile(filePath);
                    if (!stream) {
                        next(Error(`File not found for zipping archive stream: "${filePath}"`));
                        return;
                    }

                    archive.append(stream, { name: fileName });
                } catch (error) {
                    this.logger?.warn(this.reqId, 'Failed to add file to zip', { filePath, error });
                }
            }

            await archive.finalize();
        };
    }

    async getStreamFileCtrl({ filePath, filename }: { filePath: string; filename?: string }) {
        return async (_req: Request & any, res: Response & any, next: NextFunction & any) => {
            try {
                const isExists = await this.fileExists(filePath);
                if (!isExists) {
                    next(Error(`File not found: "${filePath}"`));
                    return;
                }

                const stream = await this.streamObjectFile(filePath);
                if (!stream) {
                    next(Error(`Failed to get file stream: "${filePath}"`));
                    return;
                }

                const fileInfo = await this.fileInfo(filePath);
                const fileName = filename || filePath.split('/').pop() || 'download';

                res.setHeader('Content-Type', fileInfo.ContentType || 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                if (fileInfo.ContentLength) {
                    res.setHeader('Content-Length', String(fileInfo.ContentLength));
                }

                await pump(stream, res);
            } catch (error) {
                this.logger?.error(this.reqId, 'Failed to stream file', { filePath, error });
                if (!res.headersSent) {
                    next(error);
                }
            }
        };
    }

    private getVideoRangeMW({ size, bufferMB = 5 }: { size: number; bufferMB?: number }) {
        return (req: Request & any, res: Response & any, next: NextFunction & any) => {
            try {
                if (req.method === 'HEAD') {
                    res.statusCode = 200;
                    res.setHeader('accept-ranges', 'bytes');
                    res.setHeader('content-length', size);
                    res.end();
                    return;
                }

                const bss = +(req.query.bufferStreamingSizeInMB ?? 0);
                const bufferSize = bss > 0 && bss <= 50 ? bss : (bufferMB ?? 5);
                const CHUNK_SIZE = 10 ** 6 * bufferSize;

                const rangeValues = parseRangeHeader(req.headers.range, size, CHUNK_SIZE);
                let [start, end] = rangeValues || [];
                if (!rangeValues || start < 0 || start >= size || end < 0 || end >= size || start > end) {
                    res.status(416).send('Requested Range Not Satisfiable');
                    return;
                }

                res.statusCode = 206;
                const chunkLength = end - start + 1;
                res.setHeader('content-length', chunkLength);
                res.setHeader('content-range', `bytes ${start}-${end}/${size}`);
                res.setHeader('accept-ranges', 'bytes');

                res.setHeader('content-type', 'video/mp4');
                res.locals.S3Range = `bytes=${start}-${end}`;

                next();
            } catch (error) {
                next(error);
            }
        };
    }

    async getStreamVideoFileCtrl({
        contentType = 'video/mp4',
        fileKey,
        allowedWhitelist,
        streamTimeoutMS = 30_000,
        bufferMB,
    }: {
        contentType?: string;
        fileKey: string;
        allowedWhitelist?: string[];
        bufferMB?: number | undefined;
        streamTimeoutMS?: number | undefined;
    }) {
        return async (req: Request & any, res: Response & any, next: NextFunction & any) => {
            const filePath = fileKey;
            const isExists = await this.fileExists(filePath);
            const fileSize = await this.sizeOf(filePath);
            if (!isExists) {
                next(Error(`File does not exist: "${filePath}"`));
                return;
            }

            const nextCB = async (err?: any) => {
                if (err) {
                    next(err);
                    return;
                }

                if (req.method === 'HEAD') {
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Accept-Ranges', 'bytes');
                    if (fileSize) res.setHeader('Content-Length', String(fileSize));
                    return res.status(200).end();
                }

                const abort = new AbortController();
                const onClose = () => abort.abort();
                req.once('close', onClose);

                try {
                    const Range = res.locals.S3Range;
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

            this.getVideoRangeMW({ size: fileSize, bufferMB })(req, res, nextCB);
        };
    }
}
