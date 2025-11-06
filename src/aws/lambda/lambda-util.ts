import { LambdaEvents, type LambdaEventsProps } from './lambda-events';
import type { Lambda } from '@aws-sdk/client-lambda';

export type { LambdaPayloadResponse } from './lambda-events';
export type LambdaUtilProps = LambdaEventsProps;

export class LambdaUtil<T = any> extends LambdaEvents<T> {
    constructor(props: LambdaUtilProps) {
        super(props);
    }

    get client(): Lambda {
        return this.lambda;
    }
}
