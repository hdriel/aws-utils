// @ts-ignore
import { IAMClient, ListUsersCommand } from '@aws-sdk/client-iam';
import { Credentials } from '../interfaces';
import { CREDENTIALS, ENDPOINT, REGION } from '../utils/consts';

export class IAMUtil {
    private readonly iam: IAMClient;

    constructor({
        credentials = CREDENTIALS,
        endpoint = ENDPOINT,
        region = REGION,
    }: {
        credentials: Credentials;
        endpoint: string;
        region: string;
    }) {
        this.iam = new IAMClient({
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        });
    }

    async getUserList() {
        const command = new ListUsersCommand({});
        return this.iam.send(command);
    }
}
