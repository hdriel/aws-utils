import './config';
import { S3BucketUtil } from 'aws-api-utils';

(async () => {
    const s3BucketUtil = new S3BucketUtil({ bucket: 'demo-bucket' });

    {
        await s3BucketUtil.createPublicBucket('test-bucket');
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
