import './config';
import { IAMUtil } from 'aws-api-utils';

(async () => {
    // @ts-ignore
    const iam = new IAMUtil();

    const result = await iam.getUserList();
    console.log(result);
})();
