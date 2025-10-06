import { IAMClient, ListUsersCommand } from '@aws-sdk/client-iam';
import { AWSConfigSharingUtil } from './configuration';

export class IAMUtil {
    private readonly iam: IAMClient;

    constructor({
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        debug = false,
    }: {
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        region?: string;
        debug?: boolean;
    } = {}) {
        const credentials = { accessKeyId, secretAccessKey };
        const options = {
            ...(accessKeyId && secretAccessKey && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        };

        if (debug) {
            console.log('IAMUtil client options', options);
        }

        this.iam = new IAMClient(options);
    }

    get client(): IAMClient {
        return this.iam;
    }

    async getUserList() {
        const command = new ListUsersCommand({});
        // @ts-ignore
        return this.iam.send(command);
    }

    async listUsers(maxItems?: number) {
        try {
            const command = new ListUsersCommand({ MaxItems: maxItems });
            // @ts-ignore
            const response = await this.iam.send(command);
            return response.Users;
        } catch (error) {
            console.error('Error listing IAM users:', error);
            return null;
        }
    }
}
