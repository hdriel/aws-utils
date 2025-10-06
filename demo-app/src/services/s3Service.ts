import { AWSCredentials } from '../types/aws.ts';
import axios, { Axios } from 'axios';
import { AwsTreeItem } from '../types/ui.ts';

class S3Service {
    private api: Axios;

    constructor() {
        this.api = axios.create({
            baseURL: import.meta.env.VITE_SERVER_URL,
            timeout: 10000,
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

    async testConnection(): Promise<boolean> {
        try {
            const { data: bucketRoot } = await this.api.get('/buckets');
            return Array.isArray(bucketRoot);
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    async listBuckets(): Promise<string[]> {
        try {
            const { data: response } = await this.api.get('/listBuckets');
            return response.Buckets?.map((bucket: any) => bucket.Name || '') || [];
        } catch (error) {
            console.error('Failed to list buckets:', error);
            throw error;
        }
    }

    async listObjects(_prefix: string = ''): Promise<{ directories: any[]; files: any[] }> {
        try {
            const { data: response } = await this.api.get(`/directories`);
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

    async uploadFile(file: File, path: string, onProgress?: (progress: number) => void): Promise<void> {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const pathParts = path.split('/');
            const filename = pathParts.pop();
            const directory = pathParts.join('/');

            const { data: response } = await this.api.post('/files/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'X-Upload-Directory': directory,
                    'X-Upload-Filename': filename || file.name,
                },
                onUploadProgress: onProgress
                    ? (progressEvent: any) => {
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

    async deleteObject(key: string): Promise<void> {
        try {
            const { data: response } = await this.api.delete(`/file/${key}`);

            await response;
        } catch (error) {
            console.error('Failed to delete object:', error);
            throw error;
        }
    }

    async getSignedUrl(key: string, expireIn: number): Promise<string> {
        try {
            const { data: response } = await this.api.get(`/file/${key}/url${expireIn ? `?expireIn=${expireIn}` : ''}`);

            return response;
        } catch (error) {
            console.error('Failed to generate signed URL:', error);
            throw error;
        }
    }

    async getObject(key: string): Promise<any> {
        try {
            const { data: response } = await this.api.get(`/file/${key}/data`);

            return response;
        } catch (error) {
            console.error('Failed to get object:', error);
            throw error;
        }
    }

    async tagObject(key: string, version: string): Promise<void> {
        try {
            const { data: response } = await this.api.put(`/file/${key}/version`, {
                version,
            });

            return response;
        } catch (error) {
            console.error('Failed to tag object:', error);
            throw error;
        }
    }

    disconnect() {}
}

export const s3Service = new S3Service();
