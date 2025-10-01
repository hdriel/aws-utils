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
    S3,
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
    public readonly s3: S3;

    public readonly s3Client: S3Client;

    public readonly bucket: string;

    public readonly endpoint: string;

    public readonly region: string;

    constructor({
        bucket,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
    }: {
        bucket: string;
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

        const params = {
            ...options,
            ...(s3ForcePathStyle && { forcePathStyle: s3ForcePathStyle }),
        };
        this.s3 = new S3(params);

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

    getBucketLink(bucketName?: string): string {
        return this.endpoint === 'http://localhost:4566'
            ? `${this.endpoint}/${bucketName ?? this.bucket}/`
            : `https://s3.${this.region}.amazonaws.com/${bucketName ?? this.bucket}/`;
    }

    async getBucketList(options: Partial<ListBucketsCommandInput> = {}): Promise<BucketListItem[]> {
        const command = new ListBucketsCommand(options);
        // @ts-ignore
        const response = await this.s3.send(command);
        return (response.Buckets ?? []) as unknown as BucketListItem[];
    }

    async createPublicBucket(bucketName: string) {
        try {
            // @ts-ignore
            await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
            logger.info(null, `Bucket already exists.`, { bucketName });
            return;
        } catch (err: any) {
            if (err.name !== 'NotFound') {
                logger.error(null, 'Error checking bucket:', err);
                throw err;
            }
        }

        // @ts-ignore
        const data: CreateBucketCommandOutput = await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));

        // @ts-ignore
        await this.s3.send(
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
        await this.s3.send(new PutBucketPolicyCommand({ Bucket: bucketName, Policy: JSON.stringify(policy) }));

        logger.info('AWS-S3', `Public bucket "${bucketName}" created successfully.`);

        return data;
    }

    async initBucket(
        acl: ACLs = ACLs.private,
        setConstraintLocation = false
    ): Promise<BucketCreated | CreateBucketCommandOutput | undefined> {
        const bucket = this.bucket;

        const exists = await this.s3Client
            // @ts-ignore
            .send(new HeadBucketCommand({ Bucket: bucket }))
            .then(() => true)
            .catch((err: any) => {
                if (err?.$metadata?.httpStatusCode === 404) return false;
                logger.error(null, 'failed to check bucket existence', { error: err });
                throw err;
            });

        if (exists) {
            logger.info(null, `Bucket "${bucket}" already exists`);
            return {
                Location: `${this.endpoint}/${bucket}/`,
                isExistsBucket: true,
            };
        }

        if (acl !== ACLs.private) {
            logger.info(null, 'creating public bucket', { bucket });
            return await this.createPublicBucket(bucket);
        }

        const createParams: CreateBucketCommandInput = { Bucket: bucket };

        if (setConstraintLocation) {
            createParams.CreateBucketConfiguration = {
                LocationConstraint: this.region as any,
            };
        }

        logger.info(null, 'creating private bucket', createParams);

        // @ts-ignore
        const result = await this.s3Client.send(new CreateBucketCommand(createParams));
        logger.info(null, 'Private bucket created', result);

        return result;
    }

    async createBucketDirectory(directoryPath: string): Promise<BucketDirectory> {
        const command = new PutObjectCommand({ Bucket: this.bucket, Key: directoryPath });
        // @ts-ignore
        return (await this.s3.send(command)) as BucketDirectory;
    }

    async getFileInfo(filePath: string): Promise<any> {
        const command = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });
        // @ts-ignore
        return (await this.s3.send(command)) as any;
    }

    async getBucketDirectoryFiles(
        directoryPath: string = '',
        fileNamePrefix: string = ''
    ): Promise<Array<ContentFile & { key: string }>> {
        const prefix = `${directoryPath ? `${directoryPath}/` : ''}${fileNamePrefix}`;
        const command = new ListObjectsCommand({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: '/',
        });

        // @ts-ignore
        const result = await this.s3.send(command);

        return result.Contents?.map((content: any) => ({
            ...content,
            key: content.Key.replace(prefix, ''),
            LastModified: new Date(content.LastModified),
        })) as Array<ContentFile & { key: string }>;
    }

    async getObjectStreamByChecking(filePath: string, { Range }: { Range?: string } = {}): Promise<Readable | null> {
        const isExists = await this.fileExists(filePath);
        if (!isExists) return null;

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
            ...(Range ? { Range } : {}),
        });

        // @ts-ignore
        const response = await this.s3.send(command);

        if (!response.Body || !(response.Body instanceof Readable)) {
            throw new Error('S3 response body is not a Readable stream');
        }

        return response.Body as Readable;
    }

    async getObjectStream(filePath: string, { Range }: { Range?: string } = {}): Promise<Readable> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
            ...(Range ? { Range } : {}),
        });

        // @ts-ignore
        const response = await this.s3.send(command);

        if (!response.Body || !(response.Body instanceof Readable)) {
            throw new Error('Invalid response body: not a Readable stream');
        }

        return response.Body as Readable;
    }

    async taggingFile(filePath: string, tagVersion: string = '1.0.0'): Promise<boolean> {
        const command = new PutObjectTaggingCommand({
            Bucket: this.bucket,
            Key: filePath,
            Tagging: { TagSet: [{ Key: 'version', Value: tagVersion }] },
        });

        // @ts-ignore
        return !!(await this.s3.send(command).catch(() => false));
    }

    async getFileVersion(filePath: string): Promise<string> {
        const command = new GetObjectTaggingCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        // @ts-ignore
        const result = await this.s3.send(command);

        const tag = result.TagSet?.find((tag: any) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async getFileUrl(filePath: string): Promise<string> {
        const url = await getSignedUrl(
            this.s3Client,
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: filePath,
            })
        );

        if (!url) throw new Error('FileURL Not Exists');

        return url;
    }

    async fileContentLength(filePath: string): Promise<number> {
        try {
            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: filePath });
            // @ts-ignore
            const headObject = await this.s3.send(command);

            return headObject.ContentLength || 0;
        } catch (error: any) {
            if (error.name === 'NotFound') {
                logger.warn(null, 'key not found', { key: filePath });
                return 0;
            }
            throw error;
        }
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: filePath });
            // @ts-ignore
            await this.s3.send(command);

            return true;
        } catch (error: any) {
            if (error.name === 'NotFound') {
                logger.warn(null, 'key not found', { key: filePath });
                return false;
            }
            throw error;
        }
    }

    async getFileContent(filePath: string, format?: string): Promise<Buffer | Uint8Array | Blob | string | undefined> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });

        // @ts-ignore
        const result = await this.s3.send(command);

        if (!result.Body) throw new Error('File Not Exists');

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
        fileData: any | ArrayBuffer | string,
        acl: ACL = ACLs.private,
        version: string = '1.0.0'
    ): Promise<FileUploadResponse> {
        const result = await new Upload({
            client: this.s3,
            params: {
                Bucket: this.bucket,
                ACL: acl,
                Key: filePath,
                Body: fileData,
                Tagging: `version=${version}`,
            },
        }).done();

        return {
            key: filePath,
            Location: `https://${this.bucket}.s3.amazonaws.com/${filePath}`,
            ETag: result.ETag as string,
        } as FileUploadResponse;
    }

    async deleteFile(filePath: string) {
        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });
        // @ts-ignore
        return this.s3.send(command);
    }

    async sizeOf(filePath: string) {
        const command = new HeadObjectCommand({
            Bucket: this.bucket,
            Key: filePath,
        });
        // @ts-ignore
        return this.s3.send(command).then((res) => res.ContentLength);
    }

    async zipKeysToStream(filePaths: { status: 'fulfilled' | 'rejected'; value: string }[], res: Response) {
        const archive = archiver('zip');

        // @ts-ignore
        res.setHeader('Content-Type', 'application/zip');
        // @ts-ignore
        res.setHeader('Content-Disposition', 'attachment; filename="files.zip"');
        archive.pipe(res as NodeJS.WritableStream);

        for (const filePathObj of filePaths.filter((v) => v.status === 'fulfilled')) {
            const filePath = filePathObj.value;
            const fileName = filePath.split('/').pop() as string;

            const file = await this.getObjectStream(filePath);
            archive.append(file, { name: fileName });
        }

        return archive.finalize();
    }

    async getS3VideoStream({
        Key,
        Range,
        abortSignal,
    }: {
        Key: string;
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
            const cmd = new GetObjectCommand({ Bucket: this.bucket, Key, ...(Range ? { Range } : {}) });
            // @ts-ignore
            const res: GetObjectCommandOutput = await s3Limiter(() => this.s3Client.send(cmd, { abortSignal }));

            const body = res.Body as Readable | undefined;
            if (!body) return null;

            return {
                body,
                meta: {
                    contentType: res.ContentType,
                    contentLength: typeof res.ContentLength === 'number' ? res.ContentLength : undefined,
                    contentRange: res.ContentRange,
                    acceptRanges: res.AcceptRanges,
                    etag: res.ETag,
                    lastModified: res.LastModified,
                },
            };
        } catch (error) {
            logger.warn(null, 'getS3VideoStream S3 stream error', { Bucket: this.bucket, Key, Range, error });
            return null;
        }
    }
}
