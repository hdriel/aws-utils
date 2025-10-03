const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT, AWS_REGION, AWS_TOPIC_ARN_EMAIL, AWS_SESSION_TOKEN } =
    {} as any;

export const ENDPOINT = AWS_ENDPOINT;

export enum ACLs {
    private = 'private',
    publicRead = 'public-read',
    publicReadWrite = 'public-read-write',
}

export const REGION = AWS_REGION;

export const TOPIC_ARN = AWS_TOPIC_ARN_EMAIL;

export const CREDENTIALS = {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    sessionToken: AWS_SESSION_TOKEN,
};
