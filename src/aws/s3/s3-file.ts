import { Buffer } from 'buffer';
import { Readable } from 'node:stream';
import ms, { type StringValue } from 'ms';
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
import { getNormalizedPath } from '../../utils/helpers';
import { ACLs } from '../../utils/consts';
import type { ContentFile, FileUploadResponse } from '../../interfaces';
import { S3Directory, type S3DirectoryProps } from './s3-directory';

export type S3FileProps = S3DirectoryProps;

export class S3File extends S3Directory {
    constructor(props: S3FileProps) {
        super(props);
    }

    async fileInfo(filePath: string): Promise<HeadObjectCommandOutput> {
        const normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') {
            throw new Error('No file key provided');
        }

        const command = new HeadObjectCommand({ Bucket: this.bucket, Key: normalizedKey });

        return await this.execute<HeadObjectCommandOutput>(command);
    }

    async fileListInfo(
        directoryPath?: string,
        fileNamePrefix?: string
    ): Promise<(ContentFile & { Location: string })[]> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '/';

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

    async fileListInfoPaginated(
        directoryPath?: string,
        {
            fileNamePrefix,
            pageNumber = 0, // 0-based: page 0 = items 0-99, page 1 = items 100-199, page 2 = items 200-299
            pageSize = 100,
            localstack,
        }: { fileNamePrefix?: string; pageSize?: number; pageNumber?: number; localstack?: boolean } = {}
    ): Promise<{ files: (ContentFile & { Location: string })[]; totalFetched: number }> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else {
            // Must filter by '/' to find files on root // THERE IS A DIFF BETWEEN LOCALSTACK TO AWS!! IN LOCALSTACK NEED THIS LINE, IN AWS it must by without this!
            if (localstack) normalizedPath = '/';
        }

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

    async taggingFile(filePath: string, tag: Tag | Tag[]): Promise<boolean> {
        let normalizedKey: string = '';
        const tags = ([] as Tag[]).concat(tag);

        try {
            normalizedKey = getNormalizedPath(filePath);
            if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
            if (S3File.leadingSlash) normalizedKey = `/${normalizedKey}`;

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

    async fileVersion(filePath: string): Promise<string> {
        const normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        const command = new GetObjectTaggingCommand({ Bucket: this.bucket, Key: normalizedKey });
        const result = await this.execute<GetObjectTaggingCommandOutput>(command);

        const tag = result.TagSet?.find((tag) => tag.Key === 'version');

        return tag?.Value ?? '';
    }

    async fileUrl(filePath: string, expiresIn: number | StringValue = '15m'): Promise<string> {
        let normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
        const expiresInSeconds = typeof expiresIn === 'number' ? expiresIn : ms(expiresIn) / 1000;

        const command = new GetObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
        const url = await getSignedUrl(this.s3Client, command, {
            expiresIn: expiresInSeconds, // is using 3600 it's will expire in 1 hour (default is 900 seconds = 15 minutes)
        });

        this.logger?.info(null, 'generate signed file url', { url, filePath: normalizedKey, expiresIn });
        return url;
    }

    async sizeOf(filePath: string, unit: 'bytes' | 'KB' | 'MB' | 'GB' = 'bytes'): Promise<number> {
        const normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

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
            const normalizedKey = getNormalizedPath(filePath);
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

    async fileContent(filePath: string, format: 'buffer' | 'base64' | 'utf8' = 'buffer'): Promise<Buffer | string> {
        let normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');
        if (!normalizedKey.includes('/')) normalizedKey = '/' + normalizedKey;

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
        const normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

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
        const normalizedKey = getNormalizedPath(filePath);
        if (!normalizedKey || normalizedKey === '/') throw new Error('No file key provided');

        const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: normalizedKey });
        return await this.execute<DeleteObjectCommandOutput>(command);
    }
}
