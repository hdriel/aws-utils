import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'pathe';

import type { Credentials, File, FILES3_METADATA } from '../interfaces';
import { S3BucketUtil } from './s3';
// import { ACL, ACLs, CREDENTIALS, ENDPOINT, REGION, FILE_TYPE } from '../utils/consts';
import { type ACL, ACLs, CREDENTIALS, ENDPOINT, REGION } from '../utils/consts';
import { logger } from '../utils/logger';

export class S3BucketMulterUtil extends S3BucketUtil {
    constructor({
        bucket,
        credentials = CREDENTIALS,
        endpoint = ENDPOINT,
        region = REGION,
        s3ForcePathStyle = true,
    }: {
        bucket: string;
        credentials?: Credentials;
        endpoint?: string;
        region?: string;
        s3ForcePathStyle?: boolean;
    }) {
        super({
            bucket,
            credentials,
            endpoint,
            region,
            s3ForcePathStyle,
        });
    }

    static fileFilter(types: string[], fileTypesChecker: RegExp) {
        return function (_req: any, file: File, cb: Function) {
            const fileExtension = path.extname(file.originalname);
            const extname = fileTypesChecker.test(fileExtension);
            const mimeType = types.some((type) => file.mimetype.startsWith(type));
            if (mimeType && extname) {
                return cb(null, true);
            } else {
                return cb(
                    new Error(`Error: Allow [${types.join(', ')}] only of extensions: ${fileTypesChecker.toString()}`),
                    false
                );
            }
        };
    }

    getUploadFilesMW(directory: string = 'files', acl: ACL = ACLs.private, options: any = {}): multer.Multer {
        if (!this.s3Client) throw `Missing 'useMulterMW' prop in constructor`;

        return multer({
            // fileFilter: S3BucketMulterUtil.fileFilter(FILE_TYPE.FILES, /xlsx|pdf|pptx|txt|docx/i),
            limits: { fileSize: options.fileSize ?? 1024 * 1024 * 5000 }, // 1GB | 250MB // todo: got from env!
            storage: multerS3({
                acl,
                s3: this.s3Client,
                bucket: this.bucket,
                contentType: multerS3.AUTO_CONTENT_TYPE,
                metadata: async (_req: any, file: File, cb: Function) => {
                    const metadata: FILES3_METADATA = { ...file, directory };
                    cb(null, metadata);
                },
                key: (req: any, file: any, cb: Function) => {
                    const filename = decodeURIComponent(file.originalname);
                    const key = req.query?.courseName
                        ? `${directory}/${req.query.courseName}/${filename}`
                        : `${directory}/general/${req.id}-${filename}`;

                    cb(null, key);
                },
            }),
        });
    }

    getUploadPrivateFilesMW(directory: string = 'files', acl: ACL = ACLs.private, options: any = {}): multer.Multer {
        if (!this.s3Client) throw `Missing 'useMulterMW' prop in constructor`;

        return multer({
            // fileFilter: S3BucketMulterUtil.fileFilter(FILE_TYPE.FILES, /xlsx|pdf|pptx|txt|docx/i),
            limits: { fileSize: options.fileSize ?? 1024 * 1024 * 100 }, // 1GB | 250MB // todo: got from env!
            storage: multerS3({
                acl,
                s3: this.s3Client,
                bucket: this.bucket,
                contentType: multerS3.AUTO_CONTENT_TYPE,
                metadata: async (_req: any, file: File, cb: Function) => {
                    const metadata: FILES3_METADATA = { ...file, directory };
                    cb(null, metadata);
                },
                key: (req: any, file: any, cb: Function) => {
                    const key = `${directory}/users/${req.params.userId}/${Date.now()}-${decodeURIComponent(
                        file.originalname
                    )}`;
                    cb(null, key);
                },
            }),
        });
    }

    get multerS3Files() {
        return this.getUploadFilesMW();
    }

    get multerS3PrivateFiles() {
        return this.getUploadPrivateFilesMW();
    }

    getUploadVideosMW(directory: string = 'videos', acl: ACL = ACLs.private): multer.Multer {
        if (!this.s3Client) throw `Missing 'useMulterMW' prop in constructor`;

        const config = {
            acl,
            s3: this.s3Client,
            bucket: this.bucket,
            contentType: multerS3.AUTO_CONTENT_TYPE,
            metadata: (_req: any, file: File, cb: Function) => {
                const metadata: FILES3_METADATA = { ...file, directory };
                cb(null, metadata);
            },
            key: (req: any, file: any, cb: Function) => {
                const fullDirectory = req.query.courseId ? `${directory ?? ''}/${req.query.courseId}` : directory;
                cb(null, `${fullDirectory}/${req.id}-${Date.now()}-${decodeURIComponent(file.originalname)}`);
            },
        };

        return multer({
            // fileFilter: S3BucketMulterUtil.fileFilter(FILE_TYPE.VIDEOS, /mp4|avi|mkv/i),
            // limits: { fileSize: 10 * 1024 * 10000 }, // 10GB
            storage: multerS3(config),
        });
    }

    get multerS3Videos() {
        return this.getUploadVideosMW();
    }

    getUploadImageMW(directory: string = 'images', acl: ACL = ACLs.private): multer.Multer {
        if (!this.s3Client) throw `Missing 'useMulterMW' prop in constructor`;

        return multer({
            // fileFilter: S3BucketMulterUtil.fileFilter(FILE_TYPE.IMAGES, /jpeg|jpg|png|gif/i),
            limits: { fileSize: 1024 * 1024 * 50 }, // 50MB
            storage: multerS3({
                acl,
                s3: this.s3Client,
                bucket: this.bucket,
                contentType: multerS3.AUTO_CONTENT_TYPE,
                metadata: (_req: any, file: File, cb: Function) => {
                    const metadata: FILES3_METADATA = { ...file, directory };
                    cb(null, metadata);
                },
                key: (req: any, file: any, cb: Function) => {
                    const key = `${directory}/${req.id}-${Date.now()}-${decodeURIComponent(file.originalname)}`;
                    logger.debug(req.id, 'upload image', {
                        acl,
                        key,
                        bucket: this.bucket,
                        contentType: multerS3.AUTO_CONTENT_TYPE,
                    });
                    cb(null, key);
                },
            }),
        });
    }

    get multerS3Images() {
        return this.getUploadImageMW();
    }
}
