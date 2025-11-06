import type { Logger } from 'stack-trace-logger';
import { Lambda } from '@aws-sdk/client-lambda';
import { AWSConfigSharingUtil } from '../configuration';

export interface LambdaBaseProps {
    logger?: Logger;
    reqId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    region?: string;
}

export class LambdaBase {
    protected readonly lambda: Lambda;

    public readonly endpoint: string;

    public readonly region: string;

    public readonly logger?: Logger;

    public readonly reqId: string | null;

    constructor({
        logger,
        reqId,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
    }: LambdaBaseProps) {
        const credentials = { accessKeyId, secretAccessKey };
        const options = {
            ...(accessKeyId && secretAccessKey && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        };
        this.endpoint = endpoint;
        this.region = region;
        this.logger = logger;
        this.reqId = reqId ?? null;

        this.lambda = new Lambda({ ...options });
    }
}
