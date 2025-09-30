import './config';
import { IAMUtil, AWSConfigSharingUtil } from 'aws-api-utils';

(async () => {
    console.table(AWSConfigSharingUtil.getConfig());
    const iam = new IAMUtil();

    const result = await iam.getUserList();
    console.log(result);
})();
