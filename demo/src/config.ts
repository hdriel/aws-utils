import env from './dotenv.ts';
import { AWSConfigSharingUtil } from '../../src';

AWSConfigSharingUtil.setConfig({
    accessKeyId: env?.AWS_ACCESS_KEY_ID,
    secretAccessKey: env?.AWS_SECRET_ACCESS_KEY,
    region: env?.AWS_REGION,
    endpoint: env?.AWS_ENDPOINT,
});

console.log('AWSConfigSharingUtil configuration');
console.table(AWSConfigSharingUtil.getConfig());
