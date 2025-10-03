// @ts-nocheck
import { Lambda, InvocationType, InvokeCommandOutput, InvokeCommand } from '@aws-sdk/client-lambda';
import { logger } from '../utils/logger';
import { AWSConfigSharingUtil } from './configuration.ts';

export class LambdaUtil<T> {
    private readonly lambda: Lambda;
    private readonly serviceFunctionName: string;

    constructor({
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        serviceFunctionName,
        debug = false,
    }: {
        serviceFunctionName: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        region?: string;
        debug?: boolean;
    }) {
        const credentials = { accessKeyId, secretAccessKey };
        const options = {
            ...(accessKeyId && secretAccessKey && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        };

        if (debug) {
            console.log('LambdaUtil client options', options);
        }

        this.serviceFunctionName = serviceFunctionName;
        this.lambda = new Lambda({
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        });
    }

    private async directInvoke({
        payload = {},
        invocationType = InvocationType.Event,
    }: {
        payload?: T;
        invocationType?: InvocationType;
    }): Promise<InvokeCommandOutput['Payload']> {
        const Payload = JSON.stringify(payload);

        try {
            const command = new InvokeCommand({
                FunctionName: this.serviceFunctionName,
                Payload,
                InvocationType: invocationType,
            });

            const data = await this.lambda.send(command);

            if (invocationType === InvocationType.RequestResponse) {
                logger.info(null, 'directInvoke lambda function response', { FunctionName, data });
            }

            const status = data.StatusCode ?? 200;
            const result = data.Payload;

            return status >= 200 && status < 300 ? result : Promise.reject(result);
        } catch (err) {
            logger.error(null, 'failed to directInvoke lambda function', {
                err,
                Payload,
                FunctionName,
            });
            throw err;
        }
    }

    async runLambdaInDryRunMode(payload?: T): Promise<InvokeCommandOutput['Payload']> {
        return this.directInvoke({
            payload,
            invocationType: InvocationType.DryRun,
        });
    }

    async triggerLambdaEvent<T>(payload?: T): Promise<InvokeCommandOutput['Payload']> {
        return this.directInvoke({
            payload,
            invocationType: InvocationType.Event,
        });
    }

    async runAndGetLambdaResponse(payload?: T): Promise<InvokeCommandOutput['Payload']> {
        return this.directInvoke({
            payload,
            invocationType: InvocationType.RequestResponse,
        });
    }
}
