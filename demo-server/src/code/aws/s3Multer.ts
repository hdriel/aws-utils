import path from 'pathe';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import multer, { type Multer } from 'multer';
import multerS3 from 'multer-s3';
import bytes, { type Unit as BytesUnit } from 'bytes';
import type { File, FILES3_METADATA } from '../interfaces';
import { S3BucketUtil } from './s3-bucket';
import { ACLs } from '../utils/consts';
import { logger } from '../utils/logger';
import { AWSConfigSharingUtil } from './configuration';

// prettier-ignore
type FILE_EXT =
    // Images
    | 'jpg' | 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | 'svg' | 'ico' | 'tif' | 'tiff' | 'heic' | 'heif' | 'raw' | 'cr2' | 'nef' | 'arw'
    // Videos
    | 'mp4' | 'avi' | 'mov' | 'wmv' | 'flv' | 'mkv' | 'webm' | 'mpeg' | 'mpg' | 'm4v' | '3gp' | 'ogv' | 'ts' | 'mts' | 'm2ts'
    // Documents
    | 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx' | 'odt' | 'ods' | 'odp' | 'rtf' | 'pages' | 'numbers' | 'key'
    // Text
    | 'txt' | 'csv' | 'json' | 'xml' | 'md' | 'log' | 'yaml' | 'yml' | 'ini' | 'conf' | 'cfg'
    // Archives
    | 'zip' | 'rar' | '7z' | 'tar' | 'gz' | 'bz2' | 'xz' | 'iso'
    // Audio
    | 'mp3' | 'wav' | 'ogg' | 'flac' | 'aac' | 'm4a' | 'wma' | 'aiff' | 'ape' | 'opus'
    // Code
    | 'js' | 'ts' | 'jsx' | 'tsx' | 'py' | 'java' | 'c' | 'cpp' | 'h' | 'cs' | 'php' | 'rb' | 'go' | 'rs' | 'swift' | 'kt' | 'scala'
    // Web
    | 'html' | 'htm' | 'css' | 'scss' | 'sass' | 'less'
    // Fonts
    | 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot'
    // 3D/CAD
    | 'obj' | 'fbx' | 'stl' | 'dae' | 'blend' | '3ds' | 'gltf' | 'glb'
    // Executable/Binary
    | 'exe' | 'dll' | 'so' | 'dylib' | 'bin' | 'dmg' | 'pkg' | 'deb' | 'rpm' | 'apk';

type FILE_TYPE = 'image' | 'video' | 'application' | 'text' | 'audio';

type ByteUnitStringValue = `${number}${BytesUnit}`;

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

export class S3BucketMulterUtil extends S3BucketUtil {
    private readonly maxUploadFileSizeRestriction: ByteUnitStringValue;

    constructor({
        bucket,
        reqId,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
        maxUploadFileSizeRestriction = '10GB',
    }: {
        bucket: string;
        reqId?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        region?: string;
        s3ForcePathStyle?: boolean;
        maxUploadFileSizeRestriction?: ByteUnitStringValue;
    }) {
        super({
            bucket,
            reqId,
            accessKeyId,
            secretAccessKey,
            endpoint,
            region,
            s3ForcePathStyle,
        });
        this.maxUploadFileSizeRestriction = maxUploadFileSizeRestriction;
    }

    private static fileFilter(types?: FILE_TYPE[], fileExt?: FILE_EXT[]) {
        const fileTypesChecker = fileExt?.length ? new RegExp(`\\.(${fileExt.join('|')})$`, 'i') : undefined;

        return function (_req: Request, file: File, cb: multer.FileFilterCallback) {
            const fileExtension = path.extname(file.originalname).substring(1); // Remove the dot
            const extname = fileTypesChecker ? fileTypesChecker.test(`.${fileExtension}`) : true;
            const mimeType = types?.length ? types.some((type) => file.mimetype.startsWith(`${type}/`)) : true;

            if (mimeType && extname) {
                return cb(null, true);
            }

            const errorMsg = !extname
                ? `Upload File Ext Error: Allowed extensions: [${fileExt?.join(', ')}]. Got: ${fileExtension}`
                : `Upload File Type Error: Allowed types: [${types?.join(', ')}]. Got: ${file.mimetype}`;

            return cb(new Error(errorMsg));
        };
    }

    private getFileSize(maxFileSize?: ByteUnitStringValue | number): number | undefined {
        const fileSizeUnitValue = maxFileSize ?? this.maxUploadFileSizeRestriction;
        const fileSize = typeof fileSizeUnitValue === 'number' ? fileSizeUnitValue : bytes(fileSizeUnitValue);

        if (!fileSize) {
            logger.warn(this.reqId, 'Failed to convert fileSize restriction, proceeding without limit', {
                maxFileSize,
                maxUploadFileSizeRestriction: this.maxUploadFileSizeRestriction,
            });
            return undefined;
        }

        return fileSize;
    }

    getUploadFileMW(
        directory: string,
        {
            acl = ACLs.private,
            maxFileSize,
            filename: _filename,
            fileType = [],
            fileExt = [],
            metadata: customMetadata,
        }: S3UploadOptions = {}
    ): Multer {
        const fileSize = this.getFileSize(maxFileSize);
        const fileTypes = ([] as FILE_TYPE[]).concat(fileType);
        const fileExts = ([] as FILE_EXT[]).concat(fileExt);
        const fileFilter =
            fileTypes?.length || fileExts?.length ? S3BucketMulterUtil.fileFilter(fileTypes, fileExts) : undefined;

        return multer({
            fileFilter,
            limits: { ...(fileSize && { fileSize }) },
            storage: multerS3({
                acl,
                s3: this.s3Client,
                bucket: this.bucket,
                contentType: multerS3.AUTO_CONTENT_TYPE,
                metadata: async (req: Request, file: File, cb: Function) => {
                    const baseMetadata: FILES3_METADATA = { ...file, directory };

                    if (customMetadata) {
                        const additionalMetadata =
                            typeof customMetadata === 'function' ? await customMetadata(req, file) : customMetadata;
                        Object.assign(baseMetadata, additionalMetadata);
                    }

                    cb(null, baseMetadata);
                },
                key: async (req: Request, file: File, cb: Function) => {
                    let filename: string;

                    if (typeof _filename === 'function') {
                        filename = await _filename(req, file);
                    } else if (_filename) {
                        filename = _filename;
                    } else {
                        filename = file.originalname;
                    }

                    filename = decodeURIComponent(filename);
                    const normalizedDirectory = directory.endsWith('/') ? directory.slice(0, -1) : directory;
                    const key = normalizedDirectory ? `${normalizedDirectory}/${filename}` : filename;

                    cb(null, key);
                },
            }),
        });
    }

    /**
     * Middleware for uploading a single file
     * Adds the uploaded file info to req.s3File
     */
    uploadSingleFile(fieldName: string, directory: string, options: S3UploadOptions = {}) {
        const upload = this.getUploadFileMW(directory, options);

        return (req: Request & { s3File?: UploadedS3File } & any, res: Response, next: NextFunction & any) => {
            const mw: any = upload.single(fieldName);
            mw(req, res, (err: any) => {
                if (err) {
                    logger.error(this.reqId, 'Single file upload error', { fieldName, error: err.message });
                    return next(err);
                }

                if (req.file) {
                    req.s3File = req.file as UploadedS3File;
                    logger.info(this.reqId, 'Single file uploaded successfully', {
                        fieldName,
                        key: req.s3File.key,
                        location: req.s3File.location,
                        size: req.s3File.size,
                    });
                }

                next();
            });
        };
    }

    /**
     * Middleware for uploading multiple files with the same field name
     * Adds the uploaded files info to req.s3Files
     */
    uploadMultipleFiles(
        fieldName: string,
        directory: string,
        maxCount: number,
        options: S3UploadOptions = {}
    ): RequestHandler {
        const upload = this.getUploadFileMW(directory, options);

        return (req: Request & { s3Files?: UploadedS3File[] } & any, res: Response, next: NextFunction & any) => {
            const mw: any = upload.array(fieldName, maxCount);
            mw(req, res, (err: any) => {
                if (err) {
                    logger.error(this.reqId, 'Multiple files upload error', { fieldName, error: err.message });
                    return next(err);
                }

                if (req.files && Array.isArray(req.files)) {
                    req.s3Files = req.files as UploadedS3File[];
                    logger.info(this.reqId, 'Multiple files uploaded successfully', {
                        fieldName,
                        count: req.s3Files.length,
                        keys: req.s3Files.map((f: any) => f.key),
                    });
                }

                next();
            });
        };
    }

    /**
     * Middleware for uploading multiple files with different field names
     * Adds the uploaded files info to req.s3FilesByField
     */
    uploadFieldsFiles(
        fields: Array<{ name: string; directory: string; maxCount?: number; options?: S3UploadOptions }>
    ): RequestHandler {
        // Create separate multer instances for each field (since each might have different options)
        const fieldConfigs = fields.map((field) => {
            const upload = this.getUploadFileMW(field.directory, field.options || {});
            return {
                name: field.name,
                maxCount: field.maxCount || 1,
                upload,
                directory: field.directory,
            };
        });

        return async (
            req: Request & { s3FilesByField?: Record<string, UploadedS3File[]> } & any,
            res: Response,
            next: NextFunction & any
        ) => {
            // We'll use the first upload instance but with fields configuration
            const multerFields = fieldConfigs.map((f) => ({ name: f.name, maxCount: f.maxCount }));
            const upload = this.getUploadFileMW(fieldConfigs[0].directory);

            const mw: any = upload.fields(multerFields);
            mw(req, res, (err: any) => {
                if (err) {
                    logger.error(this.reqId, 'Fields upload error', { error: err.message });
                    return next(err);
                }

                if (req.files && typeof req.files === 'object' && !Array.isArray(req.files)) {
                    req.s3FilesByField = req.files as Record<string, UploadedS3File[]>;

                    const uploadSummary = Object.entries(req.s3FilesByField).map(([field, files]: any) => ({
                        field,
                        count: files.length,
                        keys: files.map((f: any) => f.key),
                    }));

                    logger.info(this.reqId, 'Fields uploaded successfully', { uploadSummary });
                }

                next();
            });
        };
    }

    /**
     * Middleware for uploading any files (mixed field names)
     * Adds the uploaded files info to req.s3AllFiles
     */
    uploadAnyFiles(directory: string, maxCount?: number, options: S3UploadOptions = {}): RequestHandler {
        const upload = this.getUploadFileMW(directory, options);

        return (req: Request & { s3AllFiles?: UploadedS3File[] } & any, res: Response, next: NextFunction & any) => {
            const anyUpload: any = maxCount ? upload.any() : upload.any();

            anyUpload(req, res, (err: any) => {
                if (err) {
                    logger.error(this.reqId, 'Any files upload error', { error: err.message });
                    return next(err);
                }

                if (req.files && Array.isArray(req.files)) {
                    req.s3AllFiles = req.files as UploadedS3File[];

                    if (maxCount && req.s3AllFiles.length > maxCount) {
                        return next(new Error(`Too many files uploaded. Maximum is ${maxCount}`));
                    }

                    logger.info(this.reqId, 'Any files uploaded successfully', {
                        count: req.s3AllFiles.length,
                        keys: req.s3AllFiles.map((f: any) => f.key),
                    });
                }

                next();
            });
        };
    }
}
