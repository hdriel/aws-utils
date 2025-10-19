import { S3Stream, type S3StreamProps } from './s3-stream';

export type S3UtilProps = S3StreamProps;

export class S3Util extends S3Stream {
    constructor(props: S3UtilProps) {
        super(props);
    }
}
