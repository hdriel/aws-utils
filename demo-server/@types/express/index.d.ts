export {};

declare global {
    namespace Express {
        interface Request {
            id: string;
            user?: any;
            token?: any;
            ua?: string;
            userAgent?: any;
            mac?: any;
        }
    }
}
