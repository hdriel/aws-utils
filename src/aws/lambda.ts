// @ts-nocheck
import { Lambda, InvocationType, InvokeCommandOutput, InvokeCommand } from '@aws-sdk/client-lambda';
// import type { TELEGRAM_REQUEST_PARAMS, WHASTAPP_REQUEST_PARAMS, REPORT_SUMMARY_REQUEST_PARAMS } from '../interfaces';
import { Credentials } from '../interfaces';
import { logger } from '../utils/logger';
import { CREDENTIALS, ENDPOINT, REGION } from '../utils/consts';

// const SLS_SERVICE_NAME = Object.freeze({
//     TELEGRAM: 'serverless-telegram-dev-',
//     WHATSAPP: 'serverless-whatsapp-dev-',
//     REPORT_SUMMARY: 'serverless-report-summary-dev-',
// });
//
// const SLS_FUNCTION_NAME = Object.freeze({
//     TELEGRAM: 'directInvokeSendTextNTF',
//     WHATSAPP: 'directInvokeSendTextNTF',
//     WHATSAPP_RECONNECT: 'directInvokeInitNTF',
//     REPORT_SUMMARY: 'directInvokeReportSummary',
// });

export class LambdaUtil {
    private readonly lambda: Lambda;

    public readonly credentials: Credentials;

    public readonly region: string;

    public readonly endpoint: string;

    constructor({
        credentials = CREDENTIALS,
        endpoint = ENDPOINT,
        region = REGION,
    }: {
        credentials?: Credentials;
        endpoint?: string;
        region?: string;
    }) {
        this.credentials = credentials;
        this.region = region;
        this.endpoint = endpoint;

        this.lambda = new Lambda({
            ...(credentials && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        });
    }

    async directInvoke({
        slsServiceName,
        slsFunctionName,
        payload = {},
        invocationType = InvocationType.Event,
    }: {
        slsServiceName: string;
        slsFunctionName: string;
        payload?: object;
        invocationType?: InvocationType;
    }): Promise<InvokeCommandOutput['Payload']> {
        const Payload = JSON.stringify(payload);
        const FunctionName = `${slsServiceName}${slsFunctionName}`;

        try {
            const command = new InvokeCommand({
                FunctionName,
                Payload,
                InvocationType: invocationType,
            });

            const data = await this.lambda.send(command);

            if (invocationType === InvocationType.RequestResponse) {
                logger.info(null, 'directInvoke lambda function response', { data });
            }

            const status = data.StatusCode ?? 200;
            const result = data.Payload;

            return status >= 200 && status < 300 ? result : Promise.reject(result);
        } catch (err) {
            logger.error(null, 'failed to directInvoke lambda function', {
                err,
                Payload,
                FunctionName,
            });
            throw err;
        }
    }

    // async invokeSendTelegramMessage(payload: TELEGRAM_REQUEST_PARAMS) {
    //     return this.directInvoke({
    //         slsServiceName: SLS_SERVICE_NAME.TELEGRAM,
    //         slsFunctionName: SLS_FUNCTION_NAME.TELEGRAM,
    //         payload,
    //     });
    // }
    //
    // async invokeSendWhatsAppMessage(payload: WHASTAPP_REQUEST_PARAMS) {
    //     return this.directInvoke({
    //         slsServiceName: SLS_SERVICE_NAME.WHATSAPP,
    //         slsFunctionName: SLS_FUNCTION_NAME.WHATSAPP,
    //         payload,
    //     });
    // }
    //
    // async invokeReconnectWhatsAppMessage() {
    //     return this.directInvoke({
    //         slsServiceName: SLS_SERVICE_NAME.WHATSAPP,
    //         slsFunctionName: SLS_FUNCTION_NAME.WHATSAPP_RECONNECT,
    //     });
    // }
    //
    // async invokeReportSummaryMessage(payload: REPORT_SUMMARY_REQUEST_PARAMS) {
    //     return this.directInvoke({
    //         slsServiceName: SLS_SERVICE_NAME.REPORT_SUMMARY,
    //         slsFunctionName: SLS_FUNCTION_NAME.REPORT_SUMMARY,
    //         payload,
    //     });
    // }
}
