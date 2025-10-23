import './config';
import { S3LocalstackUtil } from '@hdriel/aws-utils';

(async () => {
    const s3BucketUtil = new S3LocalstackUtil({ bucket: 'demo' });
    const directoryTreeInfo = await s3BucketUtil.directoryListPaginated('/', { pageSize: 100, pageNumber: 0 });
    console.log('Directory tree info', JSON.stringify(directoryTreeInfo, null, 2));
})();
