import { NextFunction, Request, Response } from 'express';
import { ACLs, AWSConfigSharingUtil } from 'aws-api-utils';
import { changeS3BucketUtil } from '../shared/s3BucketUtil.shared';

export const setCredentialsCtrl = async (req: Request, res: Response, _next: NextFunction) => {
    const accessKeyId = req.body.accessKeyId;
    const region = req.body.region;
    const secretAccessKey = req.body.secretAccessKey;
    const endpoint = req.body.localstack ? 'http://localhost:4566' : undefined;
    const bucketName = req.body.bucket;
    const acl = req.body.acl as ACLs;
    try {
        if ([accessKeyId, region, secretAccessKey].every((v) => v)) {
            AWSConfigSharingUtil.setConfig({
                accessKeyId,
                region,
                secretAccessKey,
                endpoint,
            });
            await changeS3BucketUtil(bucketName, acl);
            res.sendStatus(200);
        } else {
            res.status(403).json({ message: 'MISSING CREDENTIALS' });
        }
    } catch (err) {
        res.status(403).json({ message: err });
    }
};
