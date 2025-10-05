import { ACLs, S3BucketUtil } from 'aws-api-utils';

let s3BucketUtil: S3BucketUtil;

export const getS3BucketUtil = () => {
    return s3BucketUtil;
};

export const changeS3BucketUtil = async (bucketName: string, acl: ACLs) => {
    s3BucketUtil = new S3BucketUtil({ bucket: bucketName });
    await s3BucketUtil.initBucket(acl);

    return s3BucketUtil;
};
