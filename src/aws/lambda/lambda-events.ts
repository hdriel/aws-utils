import { Buffer } from 'node:buffer';
import { InvocationType, type InvokeCommandOutput } from '@aws-sdk/client-lambda';
import { type LambdaBaseProps, LambdaBase } from './lambda-base';

export type LambdaEventsProps = LambdaBaseProps & {
    serviceFunctionName: string;
};

/**
 * The raw shape the AWS SDK hands back in `InvokeCommandOutput.Payload`
 * before it is decoded to a string.
 */
export type LambdaRawPayload = Uint8Array | string | undefined;

/** @deprecated kept for backwards compatibility - use {@link LambdaRawPayload}. */
export type LambdaPayloadResponse = LambdaRawPayload;

/**
 * Decode the SDK payload (Uint8Array | string | undefined) into a plain string.
 */
export const decodeLambdaPayload = (payload: LambdaRawPayload): string => {
    if (payload == null) return '';
    if (typeof payload === 'string') return payload;
    return Buffer.from(payload).toString('utf8');
};

const safeJsonParse = <R>(raw: string): R => {
    try {
        return JSON.parse(raw) as R;
    } catch {
        return raw as unknown as R;
    }
};

/**
 * @typeParam TPayload - the request payload the lambda expects.
 * @typeParam TResult  - the (already JSON-parsed) value the lambda returns.
 */
export class LambdaEvents<TPayload = any, TResult = any> extends LambdaBase {
    protected readonly serviceFunctionName: string;

    constructor({ serviceFunctionName, ...props }: LambdaEventsProps) {
        super(props);
        this.serviceFunctionName = serviceFunctionName;
    }

    protected async directInvoke({
        payload,
        invocationType = InvocationType.Event,
    }: {
        payload?: TPayload;
        invocationType?: InvocationType;
    }): Promise<InvokeCommandOutput> {
        const FunctionName = this.serviceFunctionName;
        const Payload = JSON.stringify(payload ?? {});

        try {
            const data = await this.lambda.invoke({ FunctionName, Payload, InvocationType: invocationType });

            if (invocationType === InvocationType.RequestResponse) {
                this.logger?.debug(null, 'directInvoke lambda function response', {
                    FunctionName,
                    invocationType,
                    statusCode: data.StatusCode,
                    functionError: data.FunctionError,
                });
            }

            return data;
        } catch (err) {
            this.logger?.error(null, 'failed to directInvoke lambda function', { err, Payload, FunctionName });
            throw err;
        }
    }

    async runLambdaInDryRunMode(payload?: TPayload): Promise<InvokeCommandOutput> {
        return this.directInvoke({ payload, invocationType: InvocationType.DryRun });
    }

    async triggerLambdaEvent(payload?: TPayload): Promise<InvokeCommandOutput> {
        return this.directInvoke({ payload, invocationType: InvocationType.Event });
    }

    /**
     * Invoke the lambda synchronously (RequestResponse) and return its response
     * already decoded from the payload buffer and `JSON.parse`d, typed as `R`.
     *
     * Throws when the invocation status is not 2xx or when the lambda itself
     * threw (`FunctionError`).
     */
    async runAndGetLambdaResponse<R = TResult>(payload?: TPayload): Promise<R> {
        const data = await this.directInvoke({ payload, invocationType: InvocationType.RequestResponse });
        const raw = decodeLambdaPayload(data.Payload);
        const statusCode = data.StatusCode ?? 0;

        if (statusCode < 200 || statusCode >= 300) {
            throw new Error(
                `lambda "${this.serviceFunctionName}" invocation failed with status ${statusCode}` +
                    (raw ? `: ${raw}` : '')
            );
        }

        if (data.FunctionError) {
            throw new Error(
                `lambda "${this.serviceFunctionName}" returned FunctionError "${data.FunctionError}": ${raw}`
            );
        }

        return raw ? safeJsonParse<R>(raw) : (undefined as R);
    }

    /**
     * Like {@link runAndGetLambdaResponse}, but also unwraps an API-Gateway-style
     * proxy response `{ statusCode, body }` (where `body` is itself a JSON string),
     * returning the parsed `body` and throwing on a non-2xx `statusCode`.
     */
    async runAndGetProxyResponse<R = TResult>(payload?: TPayload): Promise<R> {
        const parsed = await this.runAndGetLambdaResponse<unknown>(payload);

        if (parsed && typeof parsed === 'object' && 'statusCode' in parsed && 'body' in parsed) {
            const { statusCode, body } = parsed as { statusCode: number; body: unknown };
            const result = typeof body === 'string' ? safeJsonParse<any>(body) : body;

            if (statusCode < 200 || statusCode >= 300) {
                const errMsg =
                    result && typeof result === 'object' && 'error' in result
                        ? (result as { error?: string }).error
                        : undefined;
                throw new Error(errMsg ?? `lambda proxy response failed with status ${statusCode}`);
            }

            return result as R;
        }

        return parsed as R;
    }
}
