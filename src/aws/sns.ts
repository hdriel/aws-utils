import { SNS } from '@aws-sdk/client-sns';
import { Credentials } from '../interfaces';
import { CREDENTIALS, ENDPOINT, REGION, TOPIC_ARN } from '../utils/consts';

export class SNSUtil {
    private readonly sns: SNS;
    private readonly topicArn: string;

    constructor({
        credentials = CREDENTIALS,
        endpoint = ENDPOINT,
        region = REGION,
        topicArn = TOPIC_ARN,
    }: {
        credentials?: Credentials;
        endpoint?: string;
        region?: string;
        topicArn?: string;
    }) {
        this.topicArn = topicArn;
        this.sns = new SNS({
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        });
    }

    async sensMail({
        to,
        template,
        locals,
        topicArn,
    }: {
        to: string;
        template: string;
        locals: string[];
        topicArn?: string;
    }) {
        this.sns
            .publish({
                Message: JSON.stringify({ to, locals, template }),
                TopicArn: topicArn ?? this.topicArn,
            });
    }
}
