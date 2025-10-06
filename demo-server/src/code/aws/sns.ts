import { SNS } from '@aws-sdk/client-sns';
import { AWSConfigSharingUtil } from './configuration';

export class SNSUtil<T> {
    private readonly sns: SNS;
    private readonly topicArn: string;

    constructor({
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        topicArn,
        debug = false,
    }: {
        topicArn: string;
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

        this.topicArn = topicArn;
        this.sns = new SNS({
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        });
    }

    async publishTopicMessage(message: T) {
        this.sns.publish({
            Message: typeof message === 'string' ? message : JSON.stringify(message),
            TopicArn: this.topicArn,
        });
    }
}
