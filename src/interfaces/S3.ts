export interface ContentFile {
    Key: string;
    Name: string;
    LastModified: Date;
    ETag: string;
    Size: number;
    StorageClass: string;
    Owner: {
        DisplayName?: string;
        ID?: string;
    };
}

export interface FileUploadResponse {
    ETag: string;
    Location: string;
    Key: string;
    Bucket: string;
}
