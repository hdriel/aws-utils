import { S3ReadStream } from 's3-readstream';
import { SmartStream } from '../utils/smartStream';
import { S3, type HeadObjectCommandOutput } from '@aws-sdk/client-s3';

export async function createAWSStream(
    S3: S3,
    bucketParams: { Bucket: string; Key: string; Range?: string }
): Promise<S3ReadStream> {
    return new Promise((resolve, reject) => {
        try {
            const s3 = S3;

            s3.headObject(bucketParams, (error: Error | null, data?: HeadObjectCommandOutput) => {
                if (error) {
                    throw error;
                }

                // const options = {
                //     parameters: bucketParams,
                //     s3,
                //     maxLength: data.ContentLength,
                //     byteRange: 1024 * 1024 * 5, // 5MB
                // };
                // // @ts-ignore
                // const stream = new S3ReadStream(options);

                // After getting the data we want from the call to s3.headObject
                // We have everything we need to instantiate our SmartStream class
                // If you want to pass ReadableOptions to the Readable class, you pass the object as the fourth parameter

                // @ts-ignore
                const stream = new SmartStream(bucketParams, s3, data.ContentLength);

                // @ts-ignore
                resolve(stream);
            });
        } catch (error) {
            reject(error);
        }
    });
}
