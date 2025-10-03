import path from 'pathe';
import type { Request } from 'express';
import multer, { type Multer } from 'multer';
import multerS3 from 'multer-s3';
import bytes, { type Unit as BytesUnit } from 'bytes';
import type { File, FILES3_METADATA } from '../interfaces';
import { S3BucketUtil } from './s3-bucket';
import { ACLs } from '../utils/consts';
import { logger } from '../utils/logger';
import { AWSConfigSharingUtil } from './configuration.ts';

type FILE_EXT = 'xlsx' | 'pdf' | 'pptx' | 'txt' | 'docx';
type FILE_TYPE = 'image' | 'video' | 'application' | 'text';
type ByteUnitStringValue = `${number}${BytesUnit}`;

export class S3BucketMulterUtil extends S3BucketUtil {
    private readonly maxUploadFileSizeRestriction: ByteUnitStringValue;
    constructor({
        bucket,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
        maxUploadFileSizeRestriction = '10GB',
    }: {
        bucket: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        region?: string;
        s3ForcePathStyle?: boolean;
        maxUploadFileSizeRestriction?: ByteUnitStringValue;
    }) {
        super({
            bucket,
            accessKeyId,
            secretAccessKey,
            endpoint,
            region,
            s3ForcePathStyle,
        });
        this.maxUploadFileSizeRestriction = maxUploadFileSizeRestriction;
    }

    static fileFilter(types?: FILE_TYPE[], fileExt?: FILE_EXT[]) {
        const fileTypesChecker = fileExt?.length ? new RegExp(fileExt.join('|'), 'i') : undefined;

        return function (_req: Request, file: File, cb: Function) {
            const fileExtension = path.extname(file.originalname);
            const extname = fileTypesChecker?.test(fileExtension) ?? true;
            const mimeType = types?.some((type) => file.mimetype.startsWith(`${type}/`)) ?? true;

            if (mimeType && extname) {
                return cb(null, true);
            }

            return cb(
                mimeType
                    ? new Error(`Upload File Type Error: Allow only file types: [${types?.join(', ')}]`)
                    : new Error(`Upload File Ext Error: Allow only file extensions:  [${fileExt?.join(', ')}]`),
                false
            );
        };
    }

    getUploadFileMW(
        directory: string,
        {
            acl = ACLs.private,
            maxFileSize,
            filename: _filename,
            fileType = [],
            fileExt = [],
        }: {
            acl?: ACLs;
            maxFileSize?: ByteUnitStringValue | number;
            filename?: string | ((req: Request) => string);
            fileType?: FILE_TYPE | FILE_TYPE[];
            fileExt?: FILE_EXT | FILE_EXT[];
        } = {}
    ): Multer {
        const fileSizeUnitValue = maxFileSize ?? this.maxUploadFileSizeRestriction;
        const fileSize = typeof fileSizeUnitValue === 'number' ? fileSizeUnitValue : bytes(fileSizeUnitValue);
        if (!fileSize) {
            logger.warn(this.reqId, 'failed to convert fileSize restriction in getUploadFileMW, upload file anyway', {
                maxFileSize,
                maxUploadFileSizeRestriction: this.maxUploadFileSizeRestriction,
            });
        }

        const fileTypes = ([] as FILE_TYPE[]).concat(fileType);
        const fileExts = ([] as FILE_EXT[]).concat(fileExt);
        const fileFilter = fileTypes?.length ? S3BucketMulterUtil.fileFilter(fileTypes, fileExts) : undefined;

        return multer({
            fileFilter: fileFilter,
            limits: { ...(fileSize && { fileSize }) },
            storage: multerS3({
                acl,
                s3: this.s3Client,
                bucket: this.bucket,
                contentType: multerS3.AUTO_CONTENT_TYPE,
                metadata: async (_req: Request, file: File, cb: Function) => {
                    const metadata: FILES3_METADATA = { ...file, directory };
                    cb(null, metadata);
                },
                key: (req: Request, file: any, cb: Function) => {
                    const filename =
                        typeof _filename === 'function'
                            ? _filename(req)
                            : decodeURIComponent(_filename ?? file.originalname);

                    const key = [directory, filename].filter((v) => v).join('/');

                    cb(null, key);
                },
            }),
        });
    }
}
