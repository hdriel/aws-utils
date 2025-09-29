import { ENV_VARIABLES, Logger } from '@jlt/commons';

export const logger = new Logger({
    serviceName: ENV_VARIABLES.SERVICE_NAME || 'AWS',
    loggingModeLevel: ENV_VARIABLES.LOGGING_MODE,
    lineTraceLevels: ENV_VARIABLES.LOGGING_STACK_TRACE_LEVELS,
    stackTraceLines: { error: 3, warn: 3, info: 1 },
    tags: ['reqId'],
    runLocally: ENV_VARIABLES.RUN_LOCALLY,
    transportCloudWatchOptions: ENV_VARIABLES.CLOUDWATCH_OPTIONS,
});
