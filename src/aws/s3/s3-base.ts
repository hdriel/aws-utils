import type { Logger } from 'stack-trace-logger';
import http from 'http';
import https from 'https';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { S3Client, type ServiceOutputTypes } from '@aws-sdk/client-s3';
import { AWSConfigSharingUtil } from '../configuration';

export interface S3BaseProps {
    logger?: Logger;
    reqId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    region?: string;
    s3ForcePathStyle?: boolean;
}

export class S3Base {
    public readonly s3Client: S3Client;

    public readonly endpoint: string;

    public readonly region: string;

    public readonly logger?: Logger;

    public readonly reqId: string | null;

    protected readonly localstack: boolean = false;

    constructor({
        logger,
        reqId,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
        // @ts-ignore
        localstack = false,
    }: S3BaseProps) {
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
        this.localstack = localstack;

        const s3ClientParams = {
            ...options,
            ...(s3ForcePathStyle && { forcePathStyle: s3ForcePathStyle }),
            requestHandler: new NodeHttpHandler({
                httpAgent: new http.Agent({ keepAlive: true, maxSockets: 300 }),
                httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 300 }),
                connectionTimeout: 3000,
                socketTimeout: 30000,
            }),
        };
        this.s3Client = new S3Client(s3ClientParams);
    }

    protected async execute<T = ServiceOutputTypes>(command: any, options?: any): Promise<T> {
        // @ts-ignore
        return this.s3Client.send(command, options);
    }
}
