import { NextFunction, Request, Response } from 'express';
import { ACLs, AWSConfigSharingUtil } from '../code';
import { changeS3BucketUtil } from '../shared/s3BucketUtil.shared';

export const setCredentialsCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const localstack = Boolean(req.body.localstack);
    const { accessKeyId, secretAccessKey, region, bucket: bucketName, acl } = req.body;
    const endpoint = localstack ? 'http://localhost:4566' : undefined;

    try {
        if ([accessKeyId, region, secretAccessKey].every((v) => v)) {
            AWSConfigSharingUtil.setConfig({
                accessKeyId,
                region,
                secretAccessKey,
                endpoint,
            });

            await changeS3BucketUtil(bucketName, acl as ACLs);

            res.sendStatus(200);
        } else {
            res.status(403).json({ message: 'MISSING CREDENTIALS' });
        }
    } catch (err: any) {
        res.status(403).json({ message: err.message });
    }
};
