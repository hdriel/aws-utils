import { InvocationType, InvokeCommand } from '@aws-sdk/client-lambda';
import { type LambdaBaseProps, LambdaBase } from './lambda-base';

export type LambdaEventsProps = LambdaBaseProps & {
    serviceFunctionName: string;
};

export type LambdaPayloadResponse = Uint8Array | string | undefined;

export class LambdaEvents<T> extends LambdaBase {
    protected readonly serviceFunctionName: string;

    constructor({ serviceFunctionName, ...props }: LambdaEventsProps) {
        super(props);
        this.serviceFunctionName = serviceFunctionName;
    }

    protected async directInvoke<T>({
        payload = {} as T & Record<string, any>,
        invocationType = InvocationType.Event,
    }: {
        payload?: T;
        invocationType?: InvocationType;
    }): Promise<LambdaPayloadResponse> {
        const FunctionName = this.serviceFunctionName;
        const Payload = JSON.stringify(payload);

        try {
            const command = new InvokeCommand({ FunctionName, Payload, InvocationType: invocationType });
            // @ts-ignore
            const data = await this.lambda.send(command);

            if (invocationType === InvocationType.RequestResponse) {
                this.logger?.debug(null, 'directInvoke lambda function response', {
                    FunctionName,
                    data,
                    InvocationType,
                });
            }

            const status = data.StatusCode ?? 200;
            const result = data.Payload;

            return status >= 200 && status < 300 ? result : Promise.reject(result);
        } catch (err) {
            this.logger?.error(null, 'failed to directInvoke lambda function', { err, Payload, FunctionName });

            throw err;
        }
    }

    async runLambdaInDryRunMode(payload?: T): Promise<LambdaPayloadResponse> {
        return this.directInvoke({ payload, invocationType: InvocationType.DryRun });
    }

    async triggerLambdaEvent<T>(payload?: T): Promise<LambdaPayloadResponse> {
        return this.directInvoke({ payload, invocationType: InvocationType.Event });
    }

    async runAndGetLambdaResponse(payload?: T): Promise<LambdaPayloadResponse> {
        return this.directInvoke({ payload, invocationType: InvocationType.RequestResponse });
    }
}
