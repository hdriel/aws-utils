export interface AWSCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

export interface S3File {
    id: string;
    key: string;
    name: string;
    size: number;
    lastModified: Date;
    type: 'file' | 'folder';
}
