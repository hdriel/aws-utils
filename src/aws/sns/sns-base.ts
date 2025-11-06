import type { Logger } from 'stack-trace-logger';
import { SNS } from '@aws-sdk/client-sns';
import { AWSConfigSharingUtil } from '../configuration';

export interface SnsBaseProps {
    logger?: Logger;
    reqId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    region?: string;
}

export class SnsBase {
    protected readonly sns: SNS;

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
    }: SnsBaseProps) {
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

        this.sns = new SNS({ ...options });
    }
}
