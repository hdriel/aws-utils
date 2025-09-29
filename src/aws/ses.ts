import { SES } from '@aws-sdk/client-ses';
import { Credentials } from '../interfaces';
import { CREDENTIALS, ENDPOINT, REGION } from '../utils/consts';

export class SESUtil {
    private readonly ses: SES;

    constructor({
        credentials = CREDENTIALS,
        endpoint = ENDPOINT,
        region = REGION,
    }: {
        credentials?: Credentials;
        endpoint?: string;
        region?: string;
    }) {
        this.ses = new SES({
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        });
    }

    getInstance() {
        return this.ses;
    }
}
