import {
    ListObjectsCommand,
    ListObjectsV2Command,
    type ListObjectsCommandOutput,
    type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { getNormalizedPath } from '../../utils/helpers';
import type { ContentFile } from '../../interfaces';
import { S3Util, type S3UtilProps } from './s3-util';

type S3LocalstackUtilProps = S3UtilProps;

export class S3LocalstackUtil extends S3Util {
    constructor(props: S3LocalstackUtilProps) {
        super(props);
    }

    async directoryList(directoryPath?: string): Promise<{ directories: string[]; files: ContentFile[] }> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '';

        let result: ListObjectsV2CommandOutput;

        if (normalizedPath === '') {
            const [fileResponse, { CommonPrefixes }] = await Promise.all([
                this.execute<ListObjectsV2CommandOutput>(
                    new ListObjectsV2Command({
                        Bucket: this.bucket,
                        Prefix: '/',
                        Delimiter: '/',
                    })
                ),
                await this.execute<ListObjectsV2CommandOutput>(
                    new ListObjectsV2Command({
                        Bucket: this.bucket,
                        Prefix: '',
                        Delimiter: '/',
                    })
                ),
            ]);

            result = fileResponse;
            result.CommonPrefixes = CommonPrefixes;
        } else {
            result = await this.execute<ListObjectsV2CommandOutput>(
                new ListObjectsV2Command({
                    Bucket: this.bucket,
                    Prefix: normalizedPath,
                    Delimiter: '/',
                })
            );
        }

        this.logger?.debug(null, '#### directoryList', {
            normalizedPath,
            CommonPrefixes: result.CommonPrefixes,
            ContentFile: result.Contents,
        });

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
                Location: `${this.link}${content.Key.replace(/^\//, '')}`,
                LastModified: new Date(content.LastModified),
            }));

        return { directories, files };
    }

    async directoryListPaginated(
        directoryPath?: string,
        {
            pageSize = 100,
            pageNumber = 0, // 0-based: page 0 = items 0-99, page 1 = items 100-199, page 2 = items 200-299
        }: {
            pageSize?: number;
            pageNumber?: number;
        } = {}
    ): Promise<{ directories: string[]; files: ContentFile[]; totalFetched: number }> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '/';

        let continuationToken: string | undefined = undefined;
        let currentPage = 0;
        let allDirectories: string[] = [];
        let allFiles: ContentFile[] = [];

        // Loop through pages until we reach the target page
        while (currentPage <= pageNumber) {
            let result: ListObjectsV2CommandOutput;

            if (normalizedPath === '/') {
                const [fileResponse, { Contents, CommonPrefixes }] = await Promise.all([
                    this.execute<ListObjectsV2CommandOutput>(
                        new ListObjectsV2Command({
                            Bucket: this.bucket,
                            Prefix: '/',
                            Delimiter: '/',
                            MaxKeys: pageSize,
                            ContinuationToken: continuationToken,
                        })
                    ),
                    // todo:    it's going to make some bugs here,
                    //          because we got the fileResponse.NextContinuationToken
                    //          and not consider to the NextContinuationToken of the seconds response,
                    //          that mean we pull the same directory again and again,
                    //          therefore I pull all directory once, instead of logic to iterate theme..
                    //          hopefully aws fill fixing that bug to make separate calls on the root level
                    await this.execute<ListObjectsV2CommandOutput>(
                        new ListObjectsV2Command({
                            Bucket: this.bucket,
                            Prefix: '',
                            Delimiter: '/',
                            MaxKeys: 1000,
                            ContinuationToken: continuationToken,
                        })
                    ),
                ]);

                result = fileResponse;
                result.Contents ||= [];
                if (Contents?.length) result.Contents?.push(...Contents);
                result.CommonPrefixes = CommonPrefixes;
            } else {
                result = await this.execute<ListObjectsV2CommandOutput>(
                    new ListObjectsV2Command({
                        Bucket: this.bucket,
                        Prefix: normalizedPath,
                        Delimiter: '/',
                        MaxKeys: pageSize,
                        ContinuationToken: continuationToken,
                    })
                );
            }

            // If we're at the target page, extract the data
            if (currentPage === pageNumber) {
                // Extract directories
                allDirectories = (result.CommonPrefixes || [])
                    .map((prefix) => prefix.Prefix!)
                    .map((prefix) => {
                        const relativePath = prefix.replace(normalizedPath, '');
                        return relativePath.replace(/\/$/, '');
                    })
                    .filter((dir) => dir);

                // Extract files
                allFiles = (result.Contents || ([] as ContentFile[]))
                    .filter((content) => {
                        return content.Key !== normalizedPath && !content.Key?.endsWith('/');
                    })
                    .map((content: any) => ({
                        ...content,
                        Name: content.Key.replace(normalizedPath, '') || content.Key,
                        Location: `${this.link}${content.Key.replace(/^\//, '')}`,
                        LastModified: new Date(content.LastModified),
                    }));
            }

            // Move to next page
            continuationToken = result.NextContinuationToken;

            // Stop if no more results
            if (!result.IsTruncated || !continuationToken) {
                break;
            }

            currentPage++;
        }

        return {
            directories: allDirectories,
            files: allFiles,
            totalFetched: allFiles.length + allDirectories.length,
        };
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
}
