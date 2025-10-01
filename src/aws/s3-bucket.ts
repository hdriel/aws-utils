import type { Response } from 'express';
import http from 'http';
import https from 'https';
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
} from '@aws-sdk/client-s3';

import { logger } from '../utils/logger';
import { type ACL, ACLs } from '../utils/consts';
import { s3Limiter } from '../utils/concurrency';

import type { BucketCreated, BucketDirectory, BucketListItem, ContentFile, FileUploadResponse } from '../interfaces';
import { AWSConfigSharingUtil } from './configuration.ts';

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

    // todo: move to s3Utils
    async getBucketList(options: Partial<ListBucketsCommandInput> = {}): Promise<BucketListItem[]> {
        const command = new ListBucketsCommand(options);
        // @ts-ignore
        const response = await this.s3Client.send(command);
        return (response.Buckets ?? []) as unknown as BucketListItem[];
    }

    async isExistsBucket(): Promise<boolean> {
        const bucketName = this.bucket;

        try {
            // @ts-ignore
            await this.s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
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

        // @ts-ignore
        const data = await this.s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));

        // @ts-ignore
        await this.s3Client.send(
            new PutPublicAccessBlockCommand({
                Bucket: bucketName,
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: false,
                    IgnorePublicAcls: false,
                    BlockPublicPolicy: false,
                    RestrictPublicBuckets: false,
                },
            })
        );

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

        // @ts-ignore
        await this.s3Client.send(new PutBucketPolicyCommand({ Bucket: bucketName, Policy: JSON.stringify(policy) }));
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

        // @ts-ignore
        const data = await this.s3Client.send(new CreateBucketCommand(createParams));
        logger.info(this.reqId, `Private bucket created successfully.`, { bucketName });

        return data;
    }

    async initBucket(
        acl: ACLs = ACLs.private,
        includeConstraintLocation = false
    ): Promise<BucketCreated | CreateBucketCommandOutput | undefined> {
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

    async createBucketDirectory(directoryPath: string): Promise<BucketDirectory> {
        const command = new PutObjectCommand({ Bucket: this.bucket, Key: directoryPath });
        // @ts-ignore
        return (await this.s3Client.send(command)) as BucketDirectory;
    }

    async getFileInfo(filePath: string): Promise<any> {
        const command = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });
        // @ts-ignore
        return await this.s3Client.send(command);
    }

    async getBucketDirectoryFiles(
        directoryPath: string = '',
        fileNamePrefix: string = ''
    ): Promise<Array<ContentFile & { key: string }>> {
        const prefix = directoryPath ? `${directoryPath}/${fileNamePrefix}` : fileNamePrefix;
        const command = new ListObjectsCommand({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: '/',
        });

        // @ts-ignore
        const result = await this.s3Client.send(command);

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

    async getObjectStream(filePath: string, { Range }: { Range?: string } = {}): Promise<Readable> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
            ...(Range ? { Range } : {}),
        });

        // @ts-ignore
        const response = await this.s3Client.send(command);

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

            // @ts-ignore
            await this.s3Client.send(command);
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

        // @ts-ignore
        const result = await this.s3Client.send(command);

        const tag = result.TagSet?.find((tag: any) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async getFileUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        const url = await getSignedUrl(this.s3Client, command, { expiresIn });

        if (!url) throw new Error('Failed to generate signed URL');

        return url;
    }

    async fileContentLength(filePath: string): Promise<number> {
        try {
            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: filePath });
            // @ts-ignore
            const headObject = await this.s3Client.send(command);

            return headObject.ContentLength ?? 0;
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
            // @ts-ignore
            await this.s3Client.send(command);
            return true;
        } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw error;
        }
    }

    async getFileContent(filePath: string, format?: 'base64' | 'utf8'): Promise<Buffer | string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        // @ts-ignore
        const result = await this.s3Client.send(command);

        if (!result.Body) throw new Error('File body is empty');

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
        acl: ACL = ACLs.private,
        version: string = '1.0.0'
    ): Promise<FileUploadResponse> {
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
            ETag: result.ETag as string,
        };
    }

    async deleteFile(filePath: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });
        // @ts-ignore
        await this.s3Client.send(command);
    }

    async sizeOf(filePath: string): Promise<number | undefined> {
        const command = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });
        // @ts-ignore
        const response = await this.s3Client.send(command);
        return response.ContentLength;
    }

    async zipKeysToStream(filePaths: string[], res: Response): Promise<void> {
        const archive = archiver('zip');

        // @ts-ignore
        res.setHeader('Content-Type', 'application/zip');
        // @ts-ignore
        res.setHeader('Content-Disposition', 'attachment; filename="files.zip"');
        archive.pipe(res as NodeJS.WritableStream);

        for (const filePath of filePaths) {
            try {
                const fileName = filePath.split('/').pop() || filePath;
                const stream = await this.getObjectStream(filePath);
                archive.append(stream, { name: fileName });
            } catch (error) {
                logger.warn(this.reqId, 'Failed to add file to zip', { filePath, error });
            }
        }

        await archive.finalize();
    }

    async getS3VideoStream({
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

            // @ts-ignore
            const res: GetObjectCommandOutput = await s3Limiter(() => this.s3Client.send(cmd, { abortSignal }));

            const body = res.Body as Readable | undefined;
            if (!body) return null;

            return {
                body,
                meta: {
                    contentType: res.ContentType,
                    contentLength: res.ContentLength,
                    contentRange: res.ContentRange,
                    acceptRanges: res.AcceptRanges,
                    etag: res.ETag,
                    lastModified: res.LastModified,
                },
            };
        } catch (error) {
            logger.warn(this.reqId, 'getS3VideoStream error', { Bucket: this.bucket, filePath, Range, error });
            return null;
        }
    }
}
