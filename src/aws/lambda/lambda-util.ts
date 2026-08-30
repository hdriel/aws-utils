import { LambdaEvents, type LambdaEventsProps } from './lambda-events';
import type { Lambda } from '@aws-sdk/client-lambda';

export type {
    LambdaPayloadResponse,
    LambdaRawPayload,
} from './lambda-events';
export { decodeLambdaPayload } from './lambda-events';
export type LambdaUtilProps = LambdaEventsProps;

/**
 * @typeParam TPayload - the request payload the lambda expects.
 * @typeParam TResult  - the (already JSON-parsed) value the lambda returns
 *                       from `runAndGetLambdaResponse`.
 *
 * @example
 * const reportLambda = new LambdaUtil<VIBE_REPORT_PARAMS, { reportKey: string }>({
 *     serviceFunctionName: 'serverless-vibe-report-dev-directInvokeGenerateReport',
 * });
 * const { reportKey } = await reportLambda.runAndGetLambdaResponse(params);
 */
export class LambdaUtil<TPayload = any, TResult = any> extends LambdaEvents<TPayload, TResult> {
    constructor(props: LambdaUtilProps) {
        super(props);
    }

    get client(): Lambda {
        return this.lambda;
    }
}
