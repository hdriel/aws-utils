import type { Logger } from 'stack-trace-logger';
import { IAMClient, type ServiceOutputTypes } from '@aws-sdk/client-iam';
import { AWSConfigSharingUtil } from '../configuration';

export interface IamBaseProps {
    logger?: Logger;
    reqId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    region?: string;
}

export class IamBase {
    protected readonly iam: IAMClient;

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
    }: IamBaseProps) {
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

        this.iam = new IAMClient(options);
    }

    protected async execute<T = ServiceOutputTypes>(command: any, options?: any): Promise<T> {
        // @ts-ignore
        return this.iam.send(command, options);
    }
}
