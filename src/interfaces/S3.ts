import type { ByteUnitStringValue, File, FILE_EXT, FILE_TYPE, FILES3_METADATA } from './File.ts';
import { ACLs } from '../utils/consts.ts';

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

export interface UploadedS3File extends Express.Multer.File {
    bucket: string;
    key: string;
    acl: string;
    contentType: string;
    contentDisposition: null;
    storageClass: string;
    serverSideEncryption: null;
    metadata: FILES3_METADATA;
    location: string;
    etag: string;
}

export interface S3UploadOptions {
    acl?: ACLs;
    maxFileSize?: ByteUnitStringValue | number;
    filename?: string | ((req: Request, file: File) => string | Promise<string>);
    fileType?: FILE_TYPE | FILE_TYPE[];
    fileExt?: FILE_EXT | FILE_EXT[];
    metadata?:
        | Record<string, string>
        | ((req: Request, file: File) => Record<string, string> | Promise<Record<string, string>>);
}
