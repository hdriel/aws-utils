export interface S3 {
    Name: string;
    CreationDate: Date;
}

export interface Owner {
    DisplayName?: string;
    ID?: string;
}

export interface BucketListItem {
    Bucket: S3;
    Owner: Owner;
}

export interface BucketCreated {
    Location: string;
    isExistsBucket?: boolean;
    [key: string]: any;
}

export interface BucketDirectory {
    ETag: string;
}

export interface ContentFile {
    Key: string;
    LastModified: Date;
    ETag: string;
    Size: number;
    StorageClass: string;
    Owner: Owner;
}

export interface FileUploadResponse {
    ETag: string;
    Location: string;
    Key: string;
    Bucket: string;
}
