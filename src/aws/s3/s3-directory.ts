import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    type DeleteObjectsCommandOutput,
    type HeadObjectCommandOutput,
    type ListObjectsV2CommandOutput,
    type PutObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getNormalizedPath } from '../../utils/helpers';
import type { ContentFile, TreeDirectoryItem, TreeFileItem } from '../../interfaces';
import { S3Bucket, type S3BucketProps } from './s3-bucket';

export type S3DirectoryProps = S3BucketProps;

export class S3Directory extends S3Bucket {
    constructor(props: S3DirectoryProps) {
        super(props);
    }

    // todo: checked!
    async directoryExists(directoryPath: string): Promise<boolean> {
        try {
            const normalizedKey = getNormalizedPath(directoryPath);
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

    // todo: checked!
    async createDirectory(directoryPath: string): Promise<PutObjectCommandOutput> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (!normalizedPath || normalizedPath === '/') throw new Error('No directory path provided');

        const command = new PutObjectCommand({ Bucket: this.bucket, Key: `${normalizedPath}/` });
        const result = await this.execute<PutObjectCommandOutput>(command);

        return result;
    }

    // todo: checked!
    async deleteDirectory(directoryPath: string): Promise<DeleteObjectsCommandOutput | null> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (!normalizedPath) throw new Error('No directory path provided');
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
            const directoryExists = await this.directoryExists(normalizedPath);
            if (!directoryExists) {
                this.logger?.debug(this.reqId, `Directory not found`, { directoryPath: normalizedPath });
                return null;
            }
        }

        try {
            await this.execute<DeleteObjectsCommandOutput>(
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

    // todo: checked!
    async directoryList(directoryPath?: string): Promise<{ directories: string[]; files: ContentFile[] }> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = this.localstack ? '' : '/';

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

    // todo: checked!
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
        else normalizedPath = this.localstack ? '' : '/';

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

    /**
     * Get all files recursively (example for search/indexing)
     * @param directoryPath
     */
    async directoryListRecursive(directoryPath?: string): Promise<{
        directories: string[];
        files: Array<ContentFile & { Name: string }>;
    }> {
        let normalizedPath = getNormalizedPath(directoryPath);
        if (normalizedPath !== '/' && directoryPath !== '' && directoryPath !== undefined) normalizedPath += '/';
        else normalizedPath = '/';

        const allDirectories: string[] = [];
        const allFiles: Array<ContentFile & { Name: string }> = [];
        let ContinuationToken: string | undefined = undefined;

        do {
            const result: ListObjectsV2CommandOutput = await this.execute<ListObjectsV2CommandOutput>(
                new ListObjectsV2Command({
                    Bucket: this.bucket,
                    Prefix: normalizedPath,
                    ContinuationToken,
                })
            );

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
                            Location: content.Key ? `${this.link}${content.Key?.replace(/^\//, '')}` : '',
                            LastModified: content.LastModified ? new Date(content.LastModified) : null,
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
        let normalizedPath = getNormalizedPath(directoryPath);
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
                location: `${this.link}${file.Key.replace(/^\//, '')}`,
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
}
