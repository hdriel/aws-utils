import { ACLs, S3BucketMulterUtil } from '../code';

let s3BucketUtil: S3BucketMulterUtil;

export const getS3BucketUtil = () => {
    return s3BucketUtil;
};

export const changeS3BucketUtil = async (bucketName: string, acl: ACLs) => {
    s3BucketUtil = new S3BucketMulterUtil({ bucket: bucketName });
    await s3BucketUtil.initBucket(acl);

    return s3BucketUtil;
};
