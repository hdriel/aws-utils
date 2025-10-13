import './config';
import { ListUsersCommand } from '@aws-sdk/client-iam';
import { IAMUtil } from '@hdriel/aws-utils';

(async () => {
    // @ts-ignore
    const iam = new IAMUtil();
    {
        const result = await iam.client.send(new ListUsersCommand());
        console.log(result);
    }

    {
        const result = await iam.getUserList();
        console.log(result);
    }
})();
