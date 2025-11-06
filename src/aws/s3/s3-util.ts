import { S3Stream, type S3StreamProps } from './s3-stream';
import { S3Client } from '@aws-sdk/client-s3';

export type S3UtilProps = S3StreamProps;

export class S3Util extends S3Stream {
    constructor(props: S3UtilProps) {
        super(props);
    }

    get client(): S3Client {
        return this.s3Client;
    }
}
