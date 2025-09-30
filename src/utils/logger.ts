import { Logger, type LoggerLevelType } from 'stack-trace-logger';

const includeCloudWatchOptions =
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION &&
    process.env.AWS_LOG_GROUP_NAME &&
    process.env.AWS_LOG_STREAM_NAME;

export const logger = new Logger({
    serviceName: process.env.SERVICE_NAME || 'SERVER',
    loggingModeLevel: process.env.LOGGING_MODE as LoggerLevelType,
    lineTraceLevels: process.env.LOGGING_STACK_TRACE_LEVELS?.split(',') as LoggerLevelType[],
    stackTraceLines: { error: 3, warn: 3, info: 1 },
    tags: ['reqId?', 'url?'],
    runLocally: ['true', '1'].includes(process.env.RUN_LOCALLY as string),
    ...(includeCloudWatchOptions && {
        transportCloudWatchOptions: {
            awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
            awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY as string,
            awsRegion: process.env.AWS_REGION as string,
            logGroupName: process.env.AWS_LOG_GROUP_NAME as string,
            logStreamName: process.env.AWS_LOG_STREAM_NAME as string,
            retentionInDays: +(process.env.AWS_LOG_RETENTION_IN_DAY as string),
        },
    }),
});
