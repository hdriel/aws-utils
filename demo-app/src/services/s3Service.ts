import { AWSCredentials, S3File } from '../types/aws.ts';
import axios, { Axios } from 'axios';

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

    async listObjects(_prefix: string = ''): Promise<S3File[]> {
        try {
            return [];
        } catch (error) {
            console.error('Failed to list objects:', error);
            throw error;
        }
    }

    async createFolder(folderPath: string): Promise<void> {
        try {
            const { data: response } = await this.api.post('/create-directory', {
                directoryPath: folderPath,
            });

            await response;
        } catch (error) {
            console.error('Failed to create folder:', error);
            throw error;
        }
    }

    async uploadFile(file: File, path: string, onProgress?: (progress: number) => void): Promise<void> {
        try {
            const { data: response } = await this.api.post('/upload-file', {
                file,
                path,
                onProgress: onProgress
                    ? (progress: any) => {
                          const percentage = (progress.loaded / progress.total) * 100;
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

    async deleteFolder(directoryPath: string): Promise<void> {
        try {
            const { data: response } = await this.api.delete('/directory', {
                data: directoryPath,
            });

            return response;
        } catch (error) {
            console.error('Failed to delete folder:', error);
            throw error;
        }
    }

    async getSignedUrl(key: string): Promise<string> {
        try {
            const { data: response } = await this.api.get(`/file/${key}/url`);

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
