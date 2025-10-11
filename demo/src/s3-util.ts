import './config';
import { S3BucketUtil } from '../../src';

(async () => {
    const s3BucketUtil = new S3BucketUtil({ bucket: 'demo111' });
    const directoryTreeInfo = await s3BucketUtil.directoryListRecursive();
    console.log('Directory tree info', JSON.stringify(directoryTreeInfo, null, 2));
})();
