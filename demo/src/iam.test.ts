import './config';
import { IAMUtil } from 'aws-api-utils';

describe('IAM Functions', () => {
    const iam = new IAMUtil();

    describe('getUserList', () => {
        it('should return user list successfully', async () => {
            const result = await iam.getUserList();

            expect(result).toBeDefined();
            expect(result.Users).toBeDefined();
            expect(result.Users).toHaveLength(1);
            expect(result.Users![0].UserName).toBe('test-user');
        });
    });
});
