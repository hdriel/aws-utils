import './config';
import { S3BucketUtil } from 'aws-api-utils';

(async () => {
    const s3BucketUtil = new S3BucketUtil({ bucket: 'demo-bucket' });

    {
        const bucketsListBefore = await s3BucketUtil.getBucketList();
        console.log('buckets list', bucketsListBefore);

        const bucketName = 'test-bucket';
        console.log('create public bucket', bucketName);
        await s3BucketUtil.createPublicBucket(bucketName);

        const bucketsListAfter = await s3BucketUtil.getBucketList();
        console.log('buckets list after creating', bucketsListAfter);
    }
    // {
    //     const result = await iam.client.send(new ListUsersCommand());
    //     console.log(result);
    // }
    //
    // {
    //     const result = await iam.getUserList();
    //     console.log(result);
    // }
})();
