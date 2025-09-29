export interface TELEGRAM_REQUEST_PARAMS {
    url?: string;
    image?: string;
    body?: string;
    chatId?: string | string[];
}

export interface WHASTAPP_REQUEST_PARAMS {
    url?: string;
    image?: string;
    body?: string;
    to: string | string[];
    // @ts-ignore
    [key: string]: any;
}

export interface REPORT_SUMMARY_REQUEST_PARAMS {
    reportId?: string;
    projectId?: string | string[];
    days?: number;
    startDate?: number | string | Date;
    endDate?: number | string | Date;
    user?: string;
}
