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

export interface S3ResponseFile {
    ChecksumAlgorithm: string[];
    ChecksumType: string;
    ETag: string;
    Name: string;
    Key: string;
    LastModified: string;
    Size: number;
    StorageClass: string;
}

export interface ListObjectsOutput {
    directories: string[];
    files: S3ResponseFile[];
}
