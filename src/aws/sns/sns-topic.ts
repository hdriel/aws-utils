import type { PublishCommandOutput } from '@aws-sdk/client-sns'; // או הנתיב הרלוונטי אל הטיפוס ב-SDK שלך
import { type SnsBaseProps, SnsBase } from './sns-base.ts';

export type SnsTopicProps = SnsBaseProps & {
    topicArn: string;
};

export class SnsTopic<T = any> extends SnsBase {
    protected readonly topicArn: string;

    constructor({ topicArn, ...props }: SnsTopicProps) {
        super(props);
        this.topicArn = topicArn;
    }

    async publishMessage(message: T): Promise<PublishCommandOutput> {
        return this.sns.publish({
            Message: typeof message === 'string' ? message : JSON.stringify(message),
            TopicArn: this.topicArn,
        });
    }
}
