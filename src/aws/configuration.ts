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
        // Merge only the keys that were actually provided so a partial call
        // (e.g. setConfig({ region })) does not wipe the other values.
        if (accessKeyId !== undefined) AWSConfigSharingUtil.accessKeyId = accessKeyId;
        if (secretAccessKey !== undefined) AWSConfigSharingUtil.secretAccessKey = secretAccessKey;
        if (endpoint !== undefined) AWSConfigSharingUtil.endpoint = endpoint;
        if (region !== undefined) AWSConfigSharingUtil.region = region;
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
