import { Response } from 'express';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import http from 'http';
import https from 'https';
import { Upload } from '@aws-sdk/lib-storage';
import {
    CreateBucketCommand,
    GetObjectCommand,
    GetObjectCommandOutput,
    S3,
    S3Client,
    CreateBucketCommandInput,
    HeadBucketCommand,
    PutPublicAccessBlockCommand,
    PutBucketPolicyCommand,
    CreateBucketCommandOutput,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Buffer } from 'buffer';
import archiver from 'archiver';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { ACL, ACLs, CREDENTIALS, ENDPOINT, REGION } from '../utils/consts';
import { s3Limiter } from '../utils/concurrency';

import {
    BucketCreated,
    BucketDirectory,
    BucketListItem,
    ContentFile,
    Credentials,
    FileUploadResponse,
} from '../interfaces';

export class S3BucketUtil {
    public readonly s3: S3;

    public readonly s3Client: S3Client;

    public readonly credentials: Credentials;

    public readonly region: string;

    public readonly bucket: string;

    public readonly endpoint: string;

    constructor({
        bucket,
        credentials = CREDENTIALS,
        endpoint = ENDPOINT,
        region = REGION,
        s3ForcePathStyle = true,
    }: {
        bucket: string;
        credentials?: Credentials;
        endpoint?: string;
        region?: string;
        s3ForcePathStyle?: boolean;
    }) {
        this.credentials = credentials;
        this.bucket = bucket;
        this.region = region;
        this.endpoint = endpoint;

        const params = {
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
            ...(s3ForcePathStyle && { forcePathStyle: s3ForcePathStyle }),
        };
        this.s3 = new S3(params);

        const s3ClientParams = {
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
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

    getBucketLink(): string {
        return this.endpoint === 'http://localhost:4566'
            ? `${this.endpoint}/${this.bucket}/`
            : `https://s3.${this.region}.amazonaws.com/${this.bucket}/`;
    }

    async getBucketList(): Promise<BucketListItem[]> {
        return (await this.s3.listBuckets()) as unknown as BucketListItem[];
    }

    async createPublicBucket(bucketName: string) {
        try {
            await this.s3.send(new HeadBucketCommand({ Bucket: bucketName }));
            logger.info(null, `Bucket already exists.`, { bucketName });
            return;
        } catch (err: any) {
            if (err.name !== 'NotFound') {
                logger.error(null, 'Error checking bucket:', err);
                throw err;
            }
        }

        const data: CreateBucketCommandOutput = await this.s3.send(new CreateBucketCommand({ Bucket: bucketName }));
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
            .send(new HeadBucketCommand({ Bucket: bucket }))
            .then(() => true)
            .catch((err) => {
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

        const result = await this.s3Client.send(new CreateBucketCommand(createParams));
        logger.info(null, 'Private bucket created', result);

        return result;
    }

    async createBucketDirectory(directory: string): Promise<BucketDirectory> {
        return (await this.s3.putObject({ Bucket: this.bucket, Key: directory })) as BucketDirectory;
    }

    async getFileInfo(directory: string, filename: string): Promise<any> {
        return (await this.s3.headObject({
            Bucket: this.bucket,
            Key: `${directory ? `${directory}/` : ''}${filename}`,
        })) as any;
    }

    async getBucketDirectoryFiles(
        directory: string,
        fileNamePrefix: string = ''
    ): Promise<Array<ContentFile & { key: string }>> {
        const prefix = `${directory ? `${directory}/` : ''}${fileNamePrefix ?? ''}`;
        const result = await this.s3.listObjects({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: '/',
        });

        return result.Contents?.map((content: any) => ({
            ...content,
            key: content.Key.replace(prefix, ''),
            LastModified: new Date(content.LastModified),
        })) as Array<ContentFile & { key: string }>;
    }

    async getObjectStreamByChecking(
        directory: string,
        filename: string | undefined,
        { Range }: { Range?: string } = {}
    ): Promise<Readable | null> {
        const key = `${directory ? `${directory}/` : ''}${filename}`;
        const isExists = await this.fileExists(key);
        if (!isExists) return null;

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ...(Range ? { Range } : {}),
        });

        const response = await this.s3.send(command);

        if (!response.Body || !(response.Body instanceof Readable)) {
            throw new Error('S3 response body is not a Readable stream');
        }

        return response.Body as Readable;
    }

    async getObjectStream(
        directory: string,
        filename: string | undefined,
        { Range }: { Range: string | undefined } = { Range: undefined }
    ): Promise<Readable> {
        const key = `${directory ? `${directory}/` : ''}${filename}`;

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ...(Range ? { Range } : {}),
        });

        const response = await this.s3.send(command);

        if (!response.Body || !(response.Body instanceof Readable)) {
            throw new Error('Invalid response body: not a Readable stream');
        }

        return response.Body as Readable;
    }

    async taggingFile(directory: string, filename: string, tagVersion: string = '1.0.0'): Promise<boolean> {
        return !!(await this.s3
            .putObjectTagging({
                Bucket: this.bucket,
                Key: `${directory ? `${directory}/` : ''}${filename}`,
                Tagging: { TagSet: [{ Key: 'version', Value: tagVersion }] },
            })
            .catch(() => false));
    }

    async getFileVersion(directory: string, filename: string): Promise<string> {
        const key = `${directory ? `${directory}/` : ''}${filename}`;

        const result = await this.s3.getObjectTagging({
            Bucket: this.bucket,
            Key: key,
        });

        const tag = result.TagSet?.find((tag) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async getFileUrl(directory: string, filename: string): Promise<string> {
        const url = await getSignedUrl(
            this.s3Client,
            new GetObjectCommand({
                Bucket: this.bucket,
                Key: `${directory ? `${directory}/` : ''}${filename}`,
            })
        );

        if (!url) throw new Error('FileURL Not Exists');

        return url;
    }

    async fileContentLength(key: string): Promise<number> {
        try {
            const headObject = await this.s3.headObject({ Bucket: this.bucket, Key: key });

            return headObject.ContentLength || 0;
        } catch (error) {
            // @ts-ignore
            if (error.name === 'NotFound') {
                logger.warn(null, 'key not found', { key });
                return 0; // The file does not exist
            }
            throw error; // Handle other errors as needed
        }
    }

    async fileExists(key: string): Promise<boolean> {
        try {
            await this.s3.headObject({ Bucket: this.bucket, Key: key });

            return true; // The file exists
        } catch (error) {
            // @ts-ignore
            if (error.name === 'NotFound') {
                logger.warn(null, 'key not found', { key });
                return false; // The file does not exist
            }
            throw error; // Handle other errors as needed
        }
    }

    async getFileContent(
        directory: string,
        filename: string,
        format?: string
    ): Promise<Buffer | Uint8Array | Blob | string | undefined> {
        const key = `${directory ? `${directory}/` : ''}${filename}`;
        const result = await this.s3.getObject({
            Bucket: this.bucket,
            Key: key,
        });

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
        directory: string,
        filename: string,
        fileData: any | ArrayBuffer | string,
        acl: ACL = ACLs.private,
        version: string = '1.0.0'
    ): Promise<FileUploadResponse> {
        const key = `${directory ? `${directory}/` : ''}${filename}`;

        const result = await new Upload({
            client: this.s3,
            params: {
                Bucket: this.bucket,
                ACL: acl,
                Key: key,
                Body: fileData,
                Tagging: `version=${version}`,
            },
        }).done();

        return {
            key,
            Location: `https://${this.bucket}.s3.amazonaws.com/${key}`,
            ETag: result.ETag as string,
        } as FileUploadResponse;
    }

    async deleteFile(directory: string, filename: string) {
        return this.s3.deleteObject({
            Bucket: this.bucket,
            Key: `${directory ? `${directory}/` : ''}${filename}`,
        });
    }

    async sizeOf(directory: string, filename: string) {
        return this.s3
            .headObject({
                Bucket: this.bucket,
                Key: `${directory ? `${directory}/` : ''}${filename}`,
            })
            .then((res) => res.ContentLength);
    }

    async zipKeysToStream(filenames: { status: 'fulfilled' | 'rejected'; value: string }[], res: Response) {
        const archive = archiver('zip');

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="files.zip"');
        archive.pipe(res as NodeJS.WritableStream);

        for (const filename of filenames.filter((v) => v.status === 'fulfilled')) {
            const splited = filename.value.split('/');
            const key = splited.pop() as string;
            const directory = splited.join('/');

            const file = await this.getObjectStream(directory, key);
            archive.append(file, { name: key });
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
