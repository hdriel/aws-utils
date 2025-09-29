import { S3Client } from '@aws-sdk/client-s3';
import { CREDENTIALS, REGION } from '../utils/consts';

// Create an instance of the S3Client
const s3Client = new S3Client({
    ...(REGION && { region: REGION }),
    ...(CREDENTIALS && { credentials: CREDENTIALS }),
});

export { s3Client as S3Client };

export default s3Client;
