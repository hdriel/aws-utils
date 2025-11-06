import { SnsTopic, type SnsTopicProps } from './sns-topic.ts';
import type { SNS } from '@aws-sdk/client-sns';
export type SnsUtilProps = SnsTopicProps;

export class SnsUtil<T = any> extends SnsTopic<T> {
    constructor(props: SnsUtilProps) {
        super(props);
    }

    get client(): SNS {
        return this.sns;
    }
}
