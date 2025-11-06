import { IamCommands, type IamCommandsProps } from './iam-commands.ts';
import type { IAMClient } from '@aws-sdk/client-iam';

export type IamUtilProps = IamCommandsProps;

export class IamUtil extends IamCommands {
    constructor(props: IamUtilProps) {
        super(props);
    }

    get client(): IAMClient {
        return this.iam;
    }
}
