import env from './dotenv.ts';
import { AWSConfigSharingUtil } from 'aws-api-utils';

AWSConfigSharingUtil.setConfig({
    accessKeyId: env?.AWS_ACCESS_KEY_ID,
    secretAccessKey: env?.AWS_SECRET_ACCESS_KEY,
    region: env?.AWS_REGION,
    endpoint: env?.AWS_REGION,
});

console.table(AWSConfigSharingUtil.getConfig());
