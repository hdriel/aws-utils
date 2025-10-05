import AWS from 'aws-sdk';
import { AWSCredentials, S3File } from '../types/aws.ts';

class S3Service {
    private s3: AWS.S3 | null = null;
    private bucketName: string = '';

    async initialize(credentials: AWSCredentials, bucketName: string) {
        AWS.config.update({
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            region: credentials.region,
        });

        this.s3 = new AWS.S3();
        this.bucketName = bucketName;
    }

    async testConnection(): Promise<boolean> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            await this.s3.listBuckets().promise();
            return true;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }

    async listBuckets(): Promise<string[]> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const response = await this.s3.listBuckets().promise();
            return response.Buckets?.map((bucket) => bucket.Name || '') || [];
        } catch (error) {
            console.error('Failed to list buckets:', error);
            throw error;
        }
    }

    async listObjects(prefix: string = ''): Promise<S3File[]> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const params: AWS.S3.ListObjectsV2Request = {
                Bucket: this.bucketName,
                Prefix: prefix,
                Delimiter: '/',
            };

            const response = await this.s3.listObjectsV2(params).promise();
            const files: S3File[] = [];

            if (response.CommonPrefixes) {
                response.CommonPrefixes.forEach((prefix) => {
                    if (prefix.Prefix) {
                        files.push({
                            key: prefix.Prefix,
                            name: prefix.Prefix.split('/').filter(Boolean).pop() || '',
                            size: 0,
                            lastModified: new Date(),
                            type: 'folder',
                        });
                    }
                });
            }

            if (response.Contents) {
                response.Contents.forEach((obj) => {
                    if (obj.Key && obj.Key !== prefix && !obj.Key.endsWith('/')) {
                        files.push({
                            key: obj.Key,
                            name: obj.Key.split('/').pop() || '',
                            size: obj.Size || 0,
                            lastModified: obj.LastModified || new Date(),
                            type: 'file',
                        });
                    }
                });
            }

            return files;
        } catch (error) {
            console.error('Failed to list objects:', error);
            throw error;
        }
    }

    async createFolder(folderPath: string): Promise<void> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const params: AWS.S3.PutObjectRequest = {
                Bucket: this.bucketName,
                Key: folderPath.endsWith('/') ? folderPath : `${folderPath}/`,
                Body: '',
            };

            await this.s3.putObject(params).promise();
        } catch (error) {
            console.error('Failed to create folder:', error);
            throw error;
        }
    }

    async uploadFile(file: File, path: string, onProgress?: (progress: number) => void): Promise<void> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const params: AWS.S3.PutObjectRequest = {
                Bucket: this.bucketName,
                Key: path,
                Body: file,
                ContentType: file.type,
            };

            const upload = this.s3.upload(params);

            if (onProgress) {
                upload.on('httpUploadProgress', (progress) => {
                    const percentage = (progress.loaded / progress.total) * 100;
                    onProgress(percentage);
                });
            }

            await upload.promise();
        } catch (error) {
            console.error('Failed to upload file:', error);
            throw error;
        }
    }

    async deleteObject(key: string): Promise<void> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const params: AWS.S3.DeleteObjectRequest = {
                Bucket: this.bucketName,
                Key: key,
            };

            await this.s3.deleteObject(params).promise();
        } catch (error) {
            console.error('Failed to delete object:', error);
            throw error;
        }
    }

    async deleteFolder(prefix: string): Promise<void> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const objects = await this.listAllObjectsRecursive(prefix);

            if (objects.length === 0) return;

            const deleteParams: AWS.S3.DeleteObjectsRequest = {
                Bucket: this.bucketName,
                Delete: {
                    Objects: objects.map((obj) => ({ Key: obj.Key! })),
                },
            };

            await this.s3.deleteObjects(deleteParams).promise();
        } catch (error) {
            console.error('Failed to delete folder:', error);
            throw error;
        }
    }

    private async listAllObjectsRecursive(prefix: string): Promise<AWS.S3.Object[]> {
        if (!this.s3) throw new Error('S3 not initialized');

        const allObjects: AWS.S3.Object[] = [];
        let continuationToken: string | undefined;

        do {
            const params: AWS.S3.ListObjectsV2Request = {
                Bucket: this.bucketName,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            };

            const response = await this.s3.listObjectsV2(params).promise();

            if (response.Contents) {
                allObjects.push(...response.Contents);
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        return allObjects;
    }

    async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const params: AWS.S3.GetObjectRequest = {
                Bucket: this.bucketName,
                Key: key,
            };

            return this.s3.getSignedUrl('getObject', {
                ...params,
                Expires: expiresIn,
            });
        } catch (error) {
            console.error('Failed to generate signed URL:', error);
            throw error;
        }
    }

    async getObject(key: string): Promise<AWS.S3.GetObjectOutput> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const params: AWS.S3.GetObjectRequest = {
                Bucket: this.bucketName,
                Key: key,
            };

            return await this.s3.getObject(params).promise();
        } catch (error) {
            console.error('Failed to get object:', error);
            throw error;
        }
    }

    async tagObject(key: string, tags: Record<string, string>): Promise<void> {
        if (!this.s3) throw new Error('S3 not initialized');

        try {
            const params: AWS.S3.PutObjectTaggingRequest = {
                Bucket: this.bucketName,
                Key: key,
                Tagging: {
                    TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
                },
            };

            await this.s3.putObjectTagging(params).promise();
        } catch (error) {
            console.error('Failed to tag object:', error);
            throw error;
        }
    }

    disconnect() {
        this.s3 = null;
        this.bucketName = '';
    }
}

export const s3Service = new S3Service();
