import type { Response, Request, NextFunction, RequestHandler } from 'express';
import type { Logger } from 'stack-trace-logger';
import ms, { type StringValue } from 'ms';
import path from 'pathe';
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
    type HeadBucketCommandInput,
    GetBucketPolicyCommand,
    GetBucketVersioningCommand,
    GetBucketEncryptionCommand,
    GetPublicAccessBlockCommand,
    GetBucketAclCommand,
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
    type GetBucketAclCommandOutput,
    type GetPublicAccessBlockCommandOutput,
    type PublicAccessBlockConfiguration,
    type GetBucketPolicyCommandOutput,
    type GetBucketVersioningCommandOutput,
    type GetBucketEncryptionCommandOutput,
} from '@aws-sdk/client-s3';
import { ACLs } from '../utils/consts';
import { s3Limiter } from '../utils/concurrency';
import multer, { type Multer } from 'multer';
import multerS3 from 'multer-s3';
import bytes from 'bytes';
import type {
    BucketInfo,
    ByteUnitStringValue,
    ContentFile,
    File,
    FILE_EXT,
    FILE_TYPE,
    FILES3_METADATA,
    FileUploadResponse,
    S3UploadOptions,
    TreeDirectoryItem,
    TreeFileItem,
    UploadedS3File,
} from '../interfaces';
export type { UploadedS3File } from '../interfaces';
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

    private readonly maxUploadFileSizeRestriction: ByteUnitStringValue;

    constructor({
        logger,
        bucket,
        reqId,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
        maxUploadFileSizeRestriction = '10GB',
    }: {
        logger?: Logger;
        bucket: string;
        reqId?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        region?: string;
        s3ForcePathStyle?: boolean;
        maxUploadFileSizeRestriction?: ByteUnitStringValue;
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
        this.maxUploadFileSizeRestriction = maxUploadFileSizeRestriction;

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

    async getBucketList(
        options: Partial<ListBucketsCommandInput> = {},
        includePublicAccess: boolean = false
    ): Promise<Array<Bucket & { PublicAccessBlockConfiguration?: PublicAccessBlockConfiguration }> | null> {
        const command = new ListBucketsCommand(options);
        const response = await this.execute<ListBucketsCommandOutput>(command);

        const responseData = (response?.Buckets || null) as Array<
            Bucket & { PublicAccessBlockConfiguration?: PublicAccessBlockConfiguration }
        > | null;

        if (!responseData) return null;

        if (includePublicAccess) {
            await Promise.allSettled(
                responseData.map(async (data) => {
                    const result = await this.execute<GetPublicAccessBlockCommandOutput>(
                        new GetPublicAccessBlockCommand({ Bucket: data.Name })
                    );
                    data.PublicAccessBlockConfiguration = result.PublicAccessBlockConfiguration;
                })
            );
        }

        return responseData;
    }

    async isBucketExists(): Promise<boolean> {
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

        const isExists = await this.isBucketExists();
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

        const isExists = await this.isBucketExists();
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

        const isExists = await this.isBucketExists();
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

    async bucketInfo(options?: Partial<HeadBucketCommandInput>): Promise<BucketInfo> {
        const bucketName = this.bucket;
        const info: any = {
            name: bucketName,
            region: this.region,
            endpoint: this.endpoint,
            exists: false,
        };

        try {
            try {
                const headBucketResponse = await this.execute<HeadBucketCommandOutput>(
                    new HeadBucketCommand({ Bucket: bucketName, ...options })
                );
                this.logger?.debug('bucketInfo', 'HeadBucketCommandOutput', headBucketResponse);

                info.exists = true;
                info.bucketRegion = headBucketResponse.BucketRegion;
                info.accessPointAlias = headBucketResponse.AccessPointAlias;
            } catch (err: any) {
                if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
                    return info;
                }

                throw err;
            }

            // Get bucket creation date from list
            try {
                const buckets = await this.getBucketList({ Prefix: this.bucket, BucketRegion: this.region });
                this.logger?.debug('bucketInfo', 'getBucketList', { buckets });

                const bucket = buckets?.find((b) => b.Name === bucketName);
                if (bucket?.CreationDate) {
                    info.creationDate = bucket.CreationDate;
                }
            } catch (error) {
                this.logger?.warn(this.reqId, 'Failed to get bucket creation date', { bucketName, error });
            }

            try {
                const aclResponse = await this.execute<GetBucketAclCommandOutput>(
                    new GetBucketAclCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketAclCommandOutput', aclResponse);

                info.acl = aclResponse.Grants?.map((grant: any) => ({
                    grantee: grant.Grantee?.Type,
                    permission: grant.Permission,
                }));
            } catch (error) {
                this.logger?.warn(this.reqId, 'Failed to get bucket ACL', { bucketName, error });
            }

            // Get public access block configuration
            try {
                const publicAccessResponse = await this.execute<GetPublicAccessBlockCommandOutput>(
                    new GetPublicAccessBlockCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetPublicAccessBlockCommandOutput', publicAccessResponse);

                info.publicAccessBlock = publicAccessResponse.PublicAccessBlockConfiguration;
            } catch (error: any) {
                if (error.name !== 'NoSuchPublicAccessBlockConfiguration') {
                    this.logger?.warn(this.reqId, 'Failed to get public access block', { bucketName, error });
                }
            }

            // Get bucket policy
            try {
                const policyResponse = await this.execute<GetBucketPolicyCommandOutput>(
                    new GetBucketPolicyCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketPolicyCommandOutput', policyResponse);

                if (policyResponse.Policy) {
                    info.policy = JSON.parse(policyResponse.Policy);
                }
            } catch (error: any) {
                if (error.name !== 'NoSuchBucketPolicy') {
                    this.logger?.warn(this.reqId, 'Failed to get bucket policy', { bucketName, error });
                }
            }

            // Get versioning status
            try {
                const versioningResponse = await this.execute<GetBucketVersioningCommandOutput>(
                    new GetBucketVersioningCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketVersioningCommandOutput', versioningResponse);

                info.versioning = versioningResponse.Status || 'Disabled';
            } catch (error) {
                this.logger?.warn(this.reqId, 'Failed to get bucket versioning', { bucketName, error });
            }

            // Get encryption configuration
            try {
                const encryptionResponse = await this.execute<GetBucketEncryptionCommandOutput>(
                    new GetBucketEncryptionCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketEncryptionCommandOutput', encryptionResponse);

                info.encryption = {
                    enabled: true,
                    type: encryptionResponse.ServerSideEncryptionConfiguration?.Rules?.[0]
                        ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
                };
            } catch (error: any) {
                if (error.name === 'ServerSideEncryptionConfigurationNotFoundError') {
                    info.encryption = { enabled: false };
                } else {
                    this.logger?.warn(this.reqId, 'Failed to get bucket encryption', { bucketName, error });
                    info.encryption = { enabled: false };
                }
            }

            this.logger?.debug('bucketInfo', 'bucket info response', info);

            return info;
        } catch (error) {
            this.logger?.error(this.reqId, 'Failed to get bucket info', { bucketName, error });
            throw error;
        }
    }

    async destroyBucket(
        forceDeleteAllFilesBeforeDestroyBucket = false
    ): Promise<DeleteBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isBucketExists();
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
        let normalizedPath = decodeURIComponent(directoryPath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedPath) throw new Error('No directory path provided');
        if (normalizedPath === '/') normalizedPath = '';

        const command = new PutObjectCommand({ Bucket: this.bucket, Key: `${normalizedPath}/` });
        const result = await this.execute<PutObjectCommandOutput>(command);

        return result;
    }

    async deleteDirectory(directoryPath: string): Promise<DeleteObjectsCommandOutput | null> {
        let normalizedPath = decodeURIComponent(directoryPath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedPath) {
            throw new Error('No directory path provided');
        }
        if (normalizedPath === '/') normalizedPath = '';

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

    async directoryList(directoryPath?: string): Promise<{ directories: string[]; files: ContentFile[] }> {
        let normalizedPath = decodeURIComponent(directoryPath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (directoryPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        const result = await this.execute<ListObjectsV2CommandOutput>(
            new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: normalizedPath,
                Delimiter: '/',
            })
        );

        // Extract directories (CommonPrefixes)
        const directories = (result.CommonPrefixes || [])
            .map((prefix) => prefix.Prefix!)
            .map((prefix) => {
                // Remove the base path and trailing slash to get just the directory name
                const relativePath = prefix.replace(normalizedPath, '');
                const dir = relativePath.replace(/\/$/, '');
                return dir;
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
                Name: content.Key.replace(normalizedPath, '') || content.Key,
                LastModified: new Date(content.LastModified),
            }));

        return { directories, files };
    }

    /**
     * Get all files recursively (example for search/indexing)
     * @param directoryPath
     */
    async directoryListRecursive(directoryPath?: string): Promise<{
        directories: string[];
        files: Array<ContentFile & { Name: string }>;
    }> {
        let normalizedPath = decodeURIComponent(directoryPath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (directoryPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        const allDirectories: string[] = [];
        const allFiles: Array<ContentFile & { Name: string }> = [];
        let ContinuationToken: string | undefined = undefined;

        do {
            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: normalizedPath,
                ContinuationToken,
            });

            const result: any = await this.execute<ListObjectsV2CommandOutput>(command);

            if (result.Contents) {
                for (const content of result.Contents) {
                    const fullPath = content.Key!;
                    const relativePath = fullPath.replace(normalizedPath, '');
                    const filename = fullPath.split('/').pop();

                    // If it ends with /, it's a directory marker
                    if (fullPath.endsWith('/')) {
                        allDirectories.push(relativePath.slice(0, -1)); // Remove trailing /
                    } else {
                        // It's a file
                        allFiles.push({
                            ...content,
                            Name: filename,
                            Path: fullPath,
                            LastModified: new Date(content.LastModified),
                        } as ContentFile & { Name: string; Path: string });
                    }
                }
            }

            ContinuationToken = result.NextContinuationToken;
        } while (ContinuationToken);

        return { directories: allDirectories, files: allFiles };
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
    async directoryTree(directoryPath?: string): Promise<TreeDirectoryItem> {
        let normalizedPath = decodeURIComponent(directoryPath?.replace(/^\//, '').replace(/\/$/, '') || '');
        const lastDirectory = directoryPath?.split('/').pop();
        const { directories, files } = await this.directoryList(normalizedPath);

        if (directoryPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        const treeNode: any = {
            path: '/' + normalizedPath,
            name: lastDirectory || this.bucket,
            type: 'directory',
            children: [] as Array<TreeDirectoryItem | TreeFileItem>,
        } as TreeDirectoryItem;

        // Add files
        for (const file of files) {
            treeNode.children.push({
                path: '/' + file.Key,
                name: file.Name,
                type: 'file',
                size: file.Size,
                lastModified: file.LastModified,
            } as TreeFileItem);
        }

        // Add directories (recursively)
        for (const dir of directories) {
            const subPath = treeNode.path + dir;
            const subTree = await this.directoryTree(subPath);
            treeNode.children.push(subTree);
        }

        return treeNode;
    }

    // ##### FILES BLOCK ##########################

    async fileInfo(filePath: string): Promise<HeadObjectCommandOutput> {
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        const command = new HeadObjectCommand({ Bucket: this.bucket, Key: normalizedKey });

        return await this.execute<HeadObjectCommandOutput>(command);
    }

    async fileListInfo(directoryPath?: string, fileNamePrefix?: string): Promise<ContentFile[]> {
        let normalizedPath = decodeURIComponent(directoryPath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (directoryPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        const prefix = normalizedPath + (fileNamePrefix || '');

        const command = new ListObjectsCommand({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: '/',
        });

        const result = await this.execute<ListObjectsCommandOutput>(command);

        const files = (result.Contents ?? ([] as ContentFile[]))
            .filter((v) => v)
            .map(
                (content) =>
                    ({
                        ...content,
                        Name: content.Key?.replace(prefix, '') ?? content.Key,
                        LastModified: content.LastModified ? new Date(content.LastModified) : null,
                    }) as ContentFile
            )
            .filter((content) => content.Name);

        this.logger?.debug(null, 'file list info', { prefix, files });

        return files;
    }

    async taggingFile(filePath: string, tagVersion: string = '1.0.0'): Promise<boolean> {
        try {
            const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
            if (!normalizedKey || normalizedKey === '/') {
                throw new Error('No file key provided');
            }

            const command = new PutObjectTaggingCommand({
                Bucket: this.bucket,
                Key: normalizedKey,
                Tagging: { TagSet: [{ Key: 'version', Value: tagVersion }] },
            });

            await this.execute<PutObjectTaggingCommandOutput>(command);

            return true;
        } catch {
            return false;
        }
    }

    async fileVersion(filePath: string): Promise<string> {
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        const command = new GetObjectTaggingCommand({ Bucket: this.bucket, Key: normalizedKey });
        const result = await this.execute<GetObjectTaggingCommandOutput>(command);

        const tag = result.TagSet?.find((tag) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async fileUrl(filePath: string, expiresIn: number | StringValue = '15m'): Promise<string> {
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        const expiresInSeconds = typeof expiresIn === 'number' ? expiresIn : ms(expiresIn) / 1000;

        const command = new GetObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
        const url = await getSignedUrl(this.s3Client, command, {
            expiresIn: expiresInSeconds, // is using 3600 it's will expire in 1 hour (default is 900 seconds = 15 minutes)
        });

        this.logger?.info(null, 'generate signed file url', { url, filePath: normalizedKey, expiresIn });
        return url;
    }

    async sizeOf(filePath: string, unit: 'bytes' | 'KB' | 'MB' | 'GB' = 'bytes'): Promise<number> {
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        try {
            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
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
                this.logger?.warn(this.reqId, 'File not found', { filePath: normalizedKey });
                return 0;
            }
            throw error;
        }
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
            if (!normalizedKey || normalizedKey === '/') {
                throw new Error('No file key provided');
            }

            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
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
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        const command = new GetObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
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
    ): Promise<FileUploadResponse> {
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        const upload = new Upload({
            client: this.s3Client,
            params: {
                Bucket: this.bucket,
                ACL: acl,
                Key: normalizedKey,
                Body: fileData,
                Tagging: `version=${version}`,
            },
        });

        const result = await upload.done();

        return {
            Bucket: this.bucket,
            Key: normalizedKey,
            Location: `${this.link}${normalizedKey}`,
            ETag: result.ETag as string,
        };
    }

    async deleteFile(filePath: string): Promise<DeleteObjectCommandOutput> {
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
        return await this.execute<DeleteObjectCommandOutput>(command);
    }

    // ##### STREAMING BLOCK ##########################

    private async streamObjectFile(
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
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

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
        const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

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
                .map((filePath) => {
                    return decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
                })
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

            const normalizedKey = decodeURIComponent(filePath?.replace(/^\//, '').replace(/\/$/, '') || '');
            if (!normalizedKey || normalizedKey === '/') {
                throw new Error('No file key provided');
            }

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
            const normalizedKey = decodeURIComponent(fileKey?.replace(/^\//, '').replace(/\/$/, '') || '');
            if (!normalizedKey || normalizedKey === '/') {
                throw new Error('No file key provided');
            }

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

    private getFileSize(maxFileSize?: ByteUnitStringValue | number): number | undefined {
        const fileSizeUnitValue = maxFileSize ?? this.maxUploadFileSizeRestriction;
        const fileSize = typeof fileSizeUnitValue === 'number' ? fileSizeUnitValue : bytes(fileSizeUnitValue);

        if (!fileSize) {
            this.logger?.warn(this.reqId, 'Failed to convert fileSize restriction, proceeding without limit', {
                maxFileSize,
                maxUploadFileSizeRestriction: this.maxUploadFileSizeRestriction,
            });
            return undefined;
        }

        return fileSize;
    }

    getUploadFileMW(
        directory?: string,
        {
            acl = ACLs.private,
            maxFileSize,
            filename: _filename,
            fileType = [],
            fileExt = [],
            metadata: customMetadata,
        }: S3UploadOptions = {}
    ): Multer {
        let normalizedPath = decodeURIComponent(directory?.replace(/^\//, '').replace(/\/$/, '') || '');
        if (directory !== '/' && directory !== '' && directory !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        const fileSize = this.getFileSize(maxFileSize);
        const fileTypes = ([] as FILE_TYPE[]).concat(fileType);
        const fileExts = ([] as FILE_EXT[]).concat(fileExt);
        const fileFilter =
            fileTypes?.length || fileExts?.length ? S3BucketUtil.fileFilter(fileTypes, fileExts) : undefined;

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
    uploadSingleFile(fieldName: string, directory: string, options: S3UploadOptions = {}) {
        const upload = this.getUploadFileMW(directory, options);

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
    uploadMultipleFiles(fieldName: string, directory: string, options: S3UploadOptions = {}) {
        const upload = this.getUploadFileMW(directory, options);

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
    uploadAnyFiles(directory: string, maxCount?: number, options: S3UploadOptions = {}): RequestHandler {
        const upload = this.getUploadFileMW(directory, options);

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
}
