export class AWSConfigSharingUtil {
    static accessKeyId: string;
    static secretAccessKey: string;
    static endpoint: string;
    static region: string;

    constructor() {}

    static setConfig({
        accessKeyId,
        secretAccessKey,
        endpoint,
        region,
    }: {
        accessKeyId?: string | undefined;
        secretAccessKey?: string | undefined;
        endpoint?: string | undefined;
        region?: string | undefined;
    }) {
        AWSConfigSharingUtil.accessKeyId = accessKeyId as string;
        AWSConfigSharingUtil.secretAccessKey = secretAccessKey as string;
        AWSConfigSharingUtil.endpoint = endpoint as string;
        AWSConfigSharingUtil.region = region as string;
    }

    static getConfig() {
        return {
            accessKeyId: AWSConfigSharingUtil.accessKeyId,
            secretAccessKey: AWSConfigSharingUtil.secretAccessKey,
            region: AWSConfigSharingUtil.region,
            endpoint: AWSConfigSharingUtil.endpoint,
        };
    }
}
