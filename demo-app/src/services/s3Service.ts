import { AWSCredentials, BucketInfo, ListObjectsOutput, S3ResponseFile } from '../types/aws.ts';
import axios, { Axios, AxiosProgressEvent } from 'axios';
import qs from 'qs';
import { AwsTreeItem, FILE_TYPE } from '../types/ui.ts';

class S3Service {
    private api: Axios;
    private downloadAbortController: AbortController | null = null;

    constructor() {
        this.api = axios.create({
            baseURL: import.meta.env.VITE_SERVER_URL,
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    async initialize(
        credentials: AWSCredentials,
        bucketName: string,
        isPublicAccess: boolean,
        isUseLocalstack: boolean
    ) {
        await this.api.post('/credentials', {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            region: credentials.region,
            bucket: bucketName,
            acl: isPublicAccess ? 'public-read-write' : 'private',
            localstack: isUseLocalstack,
        });
    }

    async getConnectedBucketInfo(): Promise<BucketInfo | null> {
        try {
            const { data: bucketRoot } = await this.api.get('/buckets/bucket-info');

            return bucketRoot;
        } catch (error) {
            console.error('Connection test failed:', error);
            return null;
        }
    }

    async listBuckets(): Promise<string[]> {
        try {
            const { data: response } = await this.api.get('/listBuckets');
            return response.Buckets?.map((bucket: { Name: string }) => bucket.Name || '') || [];
        } catch (error) {
            console.error('Failed to list buckets:', error);
            throw error;
        }
    }

    async localstackBucketsList(): Promise<
        Array<{
            BucketRegion: string;
            CreationDate: string;
            Name: string;
            PublicAccessBlockConfiguration: {
                BlockPublicAcls?: boolean | undefined;
                IgnorePublicAcls?: boolean | undefined;
                BlockPublicPolicy?: boolean | undefined;
                RestrictPublicBuckets?: boolean | undefined;
            };
        }>
    > {
        try {
            const { data: response } = await this.api.get('/buckets/localstack');
            return response;
        } catch (error) {
            console.error('Failed to get localstack buckets list:', error);
            throw error;
        }
    }

    async listFileObjects(directory: string = ''): Promise<S3ResponseFile[]> {
        try {
            const query = qs.stringify({ directory: encodeURIComponent(directory) });
            const { data: response } = await this.api.get(`/directories/files?${query}`);

            // console.log('listFileObjects', directory, response);
            return response;
        } catch (error) {
            console.error('Failed to list objects:', error);
            throw error;
        }
    }

    async listObjects(directory: string = ''): Promise<ListObjectsOutput> {
        try {
            const query = qs.stringify({ ...(directory && { directory: encodeURIComponent(directory) }) });
            const { data: response } = await this.api.get(`/directories?${query}`);

            return response;
        } catch (error) {
            console.error('Failed to list objects:', error);
            throw error;
        }
    }

    async treeObjects(): Promise<AwsTreeItem> {
        try {
            const { data: response } = await this.api.get(`/directories/tree`);
            return response;
        } catch (error) {
            console.error('Failed to list objects:', error);
            throw error;
        }
    }

    async createFolder(folderPath: string): Promise<void> {
        try {
            const { data: response } = await this.api.post('/directories', {
                directory: folderPath,
            });

            await response;
        } catch (error) {
            console.error('Failed to create folder:', error);
            throw error;
        }
    }

    async deleteFolder(directoryPath: string): Promise<void> {
        try {
            const { data: response } = await this.api.delete('/directories', {
                data: { directory: directoryPath },
            });

            return response;
        } catch (error) {
            console.error('Failed to delete folder:', error);
            throw error;
        }
    }

    async deleteLocalstackBucket(bucketName: string): Promise<void> {
        try {
            const { data: response } = await this.api.delete(`/buckets/localstack/${bucketName}`);

            return response;
        } catch (error) {
            console.error('Failed to delete folder:', error);
            throw error;
        }
    }

    async uploadFile(
        file: File,
        directoryPath: string,
        type?: FILE_TYPE,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        try {
            if (!file) return;
            if (file.size === 0) {
                const { data: response } = await this.api.post('/files/content', {
                    path: directoryPath + file.name,
                    data: '',
                });
                return response;
            }

            const formData = new FormData();
            formData.append('file', file);

            // Encode directory and filename to handle non-Latin characters
            const encodedDirectory = encodeURIComponent(directoryPath);
            const encodedFilename = encodeURIComponent(file.name);

            const { data: response } = await this.api.post(`/files/upload/${type || ''}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-Upload-Directory': encodedDirectory,
                    'X-Upload-Filename': encodedFilename,
                },
                onUploadProgress: onProgress
                    ? (progressEvent: AxiosProgressEvent) => {
                          const percentage = progressEvent.total
                              ? (progressEvent.loaded / progressEvent.total) * 100
                              : 0;
                          onProgress(percentage);
                      }
                    : undefined,
            });

            return response;
        } catch (error) {
            console.error('Failed to upload file:', error);
            throw error;
        }
    }

    async uploadFiles(
        files: File[],
        directory: string,
        type?: FILE_TYPE,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        try {
            if (!files) return;

            await Promise.allSettled(
                files
                    .filter((file) => file.size === 0)
                    .map(async (file) => {
                        const { data: response } = await this.api.post('/files/content', {
                            path: [directory.replace(/\/$/, ''), file.name].join('/'),
                            data: '',
                        });
                        return response;
                    })
            );

            files = files.filter((file) => file.size !== 0);

            const formData = new FormData();
            files.forEach((file) => {
                const copyFile = new File([file], encodeURIComponent(file.name), { type: file.type });
                formData.append('files', copyFile);
            });

            const encodedDirectory = encodeURIComponent(directory);

            const { data: response } = await this.api.post(`/files/multi-upload/${type || ''}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-Upload-Directory': encodedDirectory,
                },
                onUploadProgress: onProgress
                    ? (progressEvent: AxiosProgressEvent) => {
                          const percentage = progressEvent.total
                              ? (progressEvent.loaded / progressEvent.total) * 100
                              : 0;
                          onProgress(percentage);
                      }
                    : undefined,
            });

            return response;
        } catch (error) {
            console.error('Failed to upload file:', error);
            throw error;
        }
    }

    async deleteObject(filePath: string): Promise<void> {
        try {
            const query = qs.stringify({ file: encodeURIComponent(filePath) });
            const { data: response } = await this.api.delete(`/files?${query}`);

            await response;
        } catch (error) {
            console.error('Failed to delete object:', error);
            throw error;
        }
    }

    async getSignedUrl(filePath: string, expireIn: number): Promise<string> {
        try {
            const query = qs.stringify({ expireIn: String(expireIn), filePath: encodeURIComponent(filePath) });
            const { data: response } = await this.api.get(`/files/url?${query}`);

            return response;
        } catch (error) {
            console.error('Failed to generate signed URL:', error);
            throw error;
        }
    }

    async downloadSingleFile(filePath: string, onProgress?: (progress: number) => void): Promise<[string, string]> {
        try {
            if (this.downloadAbortController) {
                this.downloadAbortController.abort();
            }

            this.downloadAbortController = new AbortController();

            const query = `file=${encodeURIComponent(filePath)}`;
            const { data, headers } = await this.api.get(`/files/download?${query}`, {
                responseType: 'blob',
                timeout: 600_000, // 10m timeout
                signal: this.downloadAbortController.signal,
                onDownloadProgress: onProgress
                    ? (progressEvent: AxiosProgressEvent) => {
                          const percentage = progressEvent.total
                              ? (progressEvent.loaded / progressEvent.total) * 100
                              : 0;
                          onProgress(percentage);
                      }
                    : undefined,
            });

            const contentDisposition = headers['content-disposition'];
            const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
            const filename = filenameMatch?.[1] || filePath.split('/').pop() || 'download';

            const blob = new Blob([data]);
            const url = window.URL.createObjectURL(blob);
            this.downloadAbortController = null;

            return [url, filename];
        } catch (error) {
            this.downloadAbortController = null;

            console.error('Failed to download file:', error);
            throw error;
        }
    }

    async downloadFilesAsZip(
        filePath: string | string[],
        filename?: string,
        onProgress?: (progress: number) => void
    ): Promise<[string, string]> {
        try {
            if (this.downloadAbortController) {
                this.downloadAbortController.abort();
            }

            this.downloadAbortController = new AbortController();

            const query = ([] as string[])
                .concat(filePath as string[])
                .map((file: string) => `file=${encodeURIComponent(file)}`)
                .join('&');

            const encodedFilename = filename ? encodeURIComponent(filename) : undefined;
            const filenameQueryString = encodedFilename ? `&filename=${encodedFilename}` : '';

            const { data } = await this.api.get(`/files/download?${query}${filenameQueryString}`, {
                responseType: 'blob',
                timeout: 600_000,
                signal: this.downloadAbortController.signal,
                onDownloadProgress: onProgress
                    ? (progressEvent: AxiosProgressEvent) => {
                          const percentage = progressEvent.total
                              ? (progressEvent.loaded / progressEvent.total) * 100
                              : 0;
                          onProgress(percentage);
                      }
                    : undefined,
            });

            // Create a blob URL and trigger download
            const blob = new Blob([data], { type: 'application/zip' });
            const url = window.URL.createObjectURL(blob);

            this.downloadAbortController = null;

            return [url, filename || 'download.zip'];
        } catch (error) {
            this.downloadAbortController = null;
            console.error('Failed to generate signed URL:', error);
            throw error;
        }
    }

    async getObject(filePath: string): Promise<string> {
        try {
            const query = qs.stringify({ filePath });
            const { data: response } = await this.api.get(`/file/data?${query}`);

            return response;
        } catch (error) {
            console.error('Failed to get object:', error);
            throw error;
        }
    }

    async tagObject(filePath: string, version: string): Promise<void> {
        try {
            const query = qs.stringify({ filePath });
            const { data: response } = await this.api.put(`/files/version?${query}`, {
                version,
            });

            return response;
        } catch (error) {
            console.error('Failed to tag object:', error);
            throw error;
        }
    }

    abortDownloadFiles() {
        if (this.downloadAbortController) {
            this.downloadAbortController.abort();
            this.downloadAbortController = null;
            console.log('Download canceled by user');
        }
    }

    async disconnect() {
        try {
            const { data: response } = await this.api.post(`/disconnect`);

            return response;
        } catch (error) {
            console.error('Failed to disconnect:', error);
            throw error;
        }
    }
}

export const s3Service = new S3Service();
