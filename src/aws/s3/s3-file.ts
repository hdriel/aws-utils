import { Buffer } from 'buffer';
import { Readable } from 'node:stream';
import ms, { type StringValue } from 'ms';
import { basename } from 'pathe';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    GetObjectTaggingCommand,
    HeadObjectCommand,
    ListObjectsCommand,
    ListObjectsV2Command,
    PutObjectTaggingCommand,
    type DeleteObjectCommandOutput,
    type GetObjectCommandOutput,
    type GetObjectTaggingCommandOutput,
    type HeadObjectCommandOutput,
    type ListObjectsCommandOutput,
    type ListObjectsV2CommandOutput,
    type PutObjectTaggingCommandOutput,
    type Tag,
} from '@aws-sdk/client-s3';
import { getNormalizedPath, getUnitBytes } from '../../utils/helpers';
import { ACLs } from '../../utils/consts';
import type { BytesUnit, ContentFile, FileUploadResponse } from '../../interfaces';
import { S3Directory, type S3DirectoryProps } from './s3-directory';

export type S3FileProps = S3DirectoryProps;

export class S3File extends S3Directory {
    constructor(props: S3FileProps) {
        super(props);
    }

    async fileInfo(
        fileKey: string
    ): Promise<HeadObjectCommandOutput & { Name: string; Location: string; Key: string }> {
        const normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        const command = new HeadObjectCommand({ Bucket: this.bucket, Key: normalizedKey });

        const result = await this.execute<HeadObjectCommandOutput>(command);

        if (!result) return result;

        return {
            ...result,
            Name: basename(normalizedKey),
            Key: normalizedKey,
            Location: `${this.link}${normalizedKey?.replace(/^\//, '')}`,
        };
    }

    async fileList(directoryPath?: string, fileNamePrefix?: string): Promise<(ContentFile & { Location: string })[]> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        // Must filter by '/' to find files on root // THERE IS A DIFF BETWEEN LOCALSTACK TO AWS!! IN LOCALSTACK NEED THIS LINE, IN AWS it must by without this!
        else normalizedPath = this.localstack ? '' : '/';

        const prefix = normalizedPath + (fileNamePrefix || '');

        const command = new ListObjectsCommand({
            Bucket: this.bucket,
            Prefix: prefix,
            Delimiter: '/',
        });

        const result = await this.execute<ListObjectsCommandOutput>(command);

        const files = (result.Contents ?? ([] as (ContentFile & { Location: string })[]))
            .filter((v) => v)
            .map(
                (content) =>
                    ({
                        ...content,
                        Name: content.Key?.replace(prefix, '') ?? content.Key,
                        Location: content.Key ? `${this.link}${content.Key?.replace(/^\//, '')}` : '',
                        LastModified: content.LastModified ? new Date(content.LastModified) : null,
                    }) as ContentFile & { Location: string }
            )
            .filter((content) => content.Name);

        this.logger?.debug(null, 'file list info', { prefix, files });

        return files;
    }

    async fileListPaginated(
        directoryPath?: string,
        {
            fileNamePrefix,
            pageNumber = 0, // 0-based: page 0 = items 0-99, page 1 = items 100-199, page 2 = items 200-299
            pageSize = 100,
        }: { fileNamePrefix?: string; pageSize?: number; pageNumber?: number } = {}
    ): Promise<{ files: (ContentFile & { Location: string })[]; totalFetched: number }> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        const prefix = normalizedPath + (fileNamePrefix || '');

        let continuationToken: string | undefined;
        let currentPage = 0;
        let resultFiles: (ContentFile & { Location: string })[] = [];

        // Loop through pages until we reach the target page
        while (currentPage <= pageNumber) {
            const result = await this.execute<ListObjectsV2CommandOutput>(
                new ListObjectsV2Command({
                    Bucket: this.bucket,
                    Prefix: prefix,
                    Delimiter: '/',
                    MaxKeys: pageSize,
                    ContinuationToken: continuationToken,
                })
            );

            // If we're at the target page, extract the data
            if (currentPage === pageNumber) {
                resultFiles = ((result.Contents ?? []) as (ContentFile & { Location: string })[])
                    .filter((v) => v)
                    .map(
                        (content) =>
                            ({
                                ...content,
                                Name: content.Key?.replace(prefix, '') ?? content.Key,
                                Location: content.Key ? `${this.link}${content.Key.replace(/^\//, '')}` : '',
                                LastModified: content.LastModified ? new Date(content.LastModified) : null,
                            }) as ContentFile & { Location: string }
                    )
                    .filter((content) => content.Name);
            }

            // Move to next page
            continuationToken = result.NextContinuationToken;

            // Stop if no more results
            if (!result.IsTruncated || !continuationToken) {
                break;
            }

            currentPage++;
        }

        this.logger?.debug(null, 'file list info paginated', {
            prefix,
            pageNumber,
            pageSize,
            fileCount: resultFiles.length,
        });

        return {
            files: resultFiles,
            totalFetched: resultFiles.length,
        };
    }

    async taggingFile(fileKey: string, tag: Tag | Tag[]): Promise<boolean> {
        let normalizedKey: string = '';
        const tags = ([] as Tag[]).concat(tag);

        try {
            normalizedKey = getNormalizedPath(fileKey);
            if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

            const command = new PutObjectTaggingCommand({
                Bucket: this.bucket,
                Key: normalizedKey,
                Tagging: { TagSet: tags },
            });

            await this.execute<PutObjectTaggingCommandOutput>(command);

            return true;
        } catch (error: any) {
            this.logger?.warn(null, 'failed to tagging file', { errMsg: error.message, fileKey: normalizedKey, tags });
            return false;
        }
    }

    async fileVersion(fileKey: string): Promise<string> {
        const normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        const command = new GetObjectTaggingCommand({ Bucket: this.bucket, Key: normalizedKey });
        const result = await this.execute<GetObjectTaggingCommandOutput>(command);

        const tag = result.TagSet?.find((tag) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async fileUrl(fileKey: string, expiresIn: number | StringValue = '15m'): Promise<string> {
        let normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
        const expiresInSeconds = typeof expiresIn === 'number' ? expiresIn : ms(expiresIn) / 1000;

        const command = new GetObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
        const url = await getSignedUrl(this.s3Client, command, {
            expiresIn: expiresInSeconds, // is using 3600 it's will expire in 1 hour (default is 900 seconds = 15 minutes)
        });

        this.logger?.info(null, 'generate signed file url', { url, fileKey: normalizedKey, expiresIn });
        return url;
    }

    async sizeOf(fileKey: string, unit: BytesUnit = 'b'): Promise<number> {
        const normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        try {
            const command = new HeadObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
            const headObject = await this.execute<HeadObjectCommandOutput>(command);
            const bytes = headObject.ContentLength ?? 0;
            return getUnitBytes(bytes, unit);
        } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                this.logger?.warn(this.reqId, 'File not found', { fileKey: normalizedKey });
                return 0;
            }
            throw error;
        }
    }

    async fileExists(fileKey: string): Promise<boolean> {
        try {
            const normalizedKey = getNormalizedPath(fileKey);
            if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

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

    async fileContent(fileKey: string, format: 'buffer' | 'base64' | 'utf8' = 'buffer'): Promise<Buffer | string> {
        let normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

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

    async uploadFileContent(
        fileKey: string,
        fileData: Buffer | Readable | string | Uint8Array | object,
        {
            acl = ACLs.private,
            version = '1.0.0',
            prettier = true,
        }: {
            acl?: ACLs;
            version?: string;
            prettier?: boolean;
        } = {}
    ): Promise<FileUploadResponse> {
        const normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        let body: Buffer | Readable | Uint8Array | string;

        if (Buffer.isBuffer(fileData)) {
            body = fileData;
        } else if (fileData instanceof Uint8Array) {
            body = fileData;
        } else if (fileData instanceof Readable) {
            body = fileData;
        } else if (typeof fileData === 'string') {
            body = fileData;
        } else {
            body = prettier ? JSON.stringify(fileData, null, 2) : JSON.stringify(fileData);
        }

        const upload = new Upload({
            client: this.s3Client,
            params: {
                Bucket: this.bucket,
                ACL: acl,
                Key: normalizedKey,
                Body: body,
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

    async deleteFile(fileKey: string): Promise<DeleteObjectCommandOutput> {
        const normalizedKey = getNormalizedPath(fileKey);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
        return await this.execute<DeleteObjectCommandOutput>(command);
    }
}
