import { ListUsersCommand, type ListUsersCommandOutput } from '@aws-sdk/client-iam';
import { type IamBaseProps, IamBase } from './iam-base.ts';

export type IamCommandsProps = IamBaseProps;

export class IamCommands extends IamBase {
    constructor({ ...props }: IamCommandsProps) {
        super(props);
    }

    async listUsers(maxItems?: number) {
        try {
            const command = new ListUsersCommand({ MaxItems: maxItems });
            const response = await this.execute<ListUsersCommandOutput>(command);

            return response.Users;
        } catch (error) {
            console.error('Error IAM users list:', error);
            return null;
        }
    }
}
