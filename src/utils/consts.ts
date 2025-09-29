const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT, AWS_REGION, AWS_TOPIC_ARN_EMAIL, AWS_SESSION_TOKEN } =
    {} as any;

export const FILE_TYPE = {
    IMAGES: ['image'],
    VIDEOS: ['video'],
    FILES: ['text', 'application'],
};

export const ENDPOINT = AWS_ENDPOINT;

export type ACL = 'private' | 'public-read' | 'public-read-write';

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
