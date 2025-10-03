import './config';
import { ACLs, S3BucketUtil } from 'aws-api-utils';

(async () => {
    const s3BucketUtil = new S3BucketUtil({ bucket: 'demo-bucket' });

    CREATE: {
        const bucketsListBefore = await s3BucketUtil.getBucketList();
        console.log('buckets list', bucketsListBefore);

        const bucketName = 'test-bucket';
        console.log('create public bucket', bucketName);
        await s3BucketUtil.initBucket(ACLs.publicRead);

        const bucketsListAfter = await s3BucketUtil.getBucketList();
        console.log('buckets list after creating', bucketsListAfter);
    }

    const filePath = 'testing/test.txt';
    const fileData =
        "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.";

    UPLOAD: {
        const fileUploadData = await s3BucketUtil.uploadFile(filePath, fileData);
        console.log('File Upload Data', fileUploadData);
    }

    READ: {
        const fileSize = await s3BucketUtil.sizeOf(filePath, 'bytes');
        console.log('File size', fileSize, fileSize === fileData.length);
    }

    DELETE: {
        const bucketsDeleteResult = await s3BucketUtil.destroyBucket();
        console.log('delete bucket', bucketsDeleteResult);
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
