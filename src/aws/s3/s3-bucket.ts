import type { Logger } from 'stack-trace-logger';
import http from 'http';
import https from 'https';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    GetBucketAclCommand,
    GetBucketEncryptionCommand,
    GetBucketPolicyCommand,
    GetBucketVersioningCommand,
    GetPublicAccessBlockCommand,
    HeadBucketCommand,
    ListBucketsCommand,
    ListObjectsV2Command,
    PutBucketPolicyCommand,
    PutPublicAccessBlockCommand,
    S3Client,
    type Bucket,
    type CreateBucketCommandInput,
    type CreateBucketCommandOutput,
    type DeleteBucketCommandInput,
    type DeleteBucketCommandOutput,
    type DeleteObjectsCommandOutput,
    type GetBucketAclCommandOutput,
    type GetBucketEncryptionCommandOutput,
    type GetBucketPolicyCommandOutput,
    type GetBucketVersioningCommandOutput,
    type GetPublicAccessBlockCommandOutput,
    type HeadBucketCommandInput,
    type HeadBucketCommandOutput,
    type ListBucketsCommandInput,
    type ListBucketsCommandOutput,
    type ListObjectsV2CommandOutput,
    type PublicAccessBlockConfiguration,
    type PutBucketPolicyCommandOutput,
    type PutPublicAccessBlockCommandOutput,
    type ServiceOutputTypes,
} from '@aws-sdk/client-s3';
import { ACLs } from '../../utils/consts';
import { AWSConfigSharingUtil } from '../configuration';
import type { BucketInfo } from '../../interfaces';

export interface S3BucketProps {
    logger?: Logger;
    bucket: string;
    reqId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    region?: string;
    s3ForcePathStyle?: boolean;
}

export class S3Bucket {
    public readonly s3Client: S3Client;

    public _bucket: string;

    public initializedBucket: string = '';

    public readonly endpoint: string;

    public readonly region: string;

    public readonly logger?: Logger;

    public readonly reqId: string | null;

    protected static leadingSlash: boolean = false;

    constructor({
        logger,
        bucket,
        reqId,
        accessKeyId = AWSConfigSharingUtil.accessKeyId,
        secretAccessKey = AWSConfigSharingUtil.secretAccessKey,
        endpoint = AWSConfigSharingUtil.endpoint,
        region = AWSConfigSharingUtil.region,
        s3ForcePathStyle = true,
    }: S3BucketProps) {
        const credentials = { accessKeyId, secretAccessKey };
        const options = {
            ...(accessKeyId && secretAccessKey && { credentials }),
            ...(endpoint && { endpoint }),
            ...(region && { region }),
        };
        this.endpoint = endpoint;
        this.region = region;
        this._bucket = decodeURIComponent(bucket);
        this.logger = logger;
        this.reqId = reqId ?? null;

        const s3ClientParams = {
            ...options,
            ...(s3ForcePathStyle && { forcePathStyle: s3ForcePathStyle }),
            requestHandler: new NodeHttpHandler({
                httpAgent: new http.Agent({ keepAlive: true, maxSockets: 300 }),
                httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 300 }),
                connectionTimeout: 3000,
                socketTimeout: 30000,
            }),
        };
        this.s3Client = new S3Client(s3ClientParams);
    }

    get link(): string {
        return this.endpoint === 'http://localhost:4566'
            ? `${this.endpoint}/${this.bucket}/`
            : `https://s3.${this.region}.amazonaws.com/${this.bucket}/`;
    }

    protected async execute<T = ServiceOutputTypes>(command: any, options?: any): Promise<T> {
        // @ts-ignore
        return this.s3Client.send(command, options);
    }

    get bucket() {
        return this._bucket;
    }

    changeBucket(bucket: string) {
        this._bucket = decodeURIComponent(bucket);
        this.initializedBucket = '';
    }

    async getBucketList({
        includePublicAccess,
        ...options
    }: Partial<ListBucketsCommandInput> & { includePublicAccess?: boolean } = {}): Promise<Array<
        Bucket & { PublicAccessBlockConfiguration?: PublicAccessBlockConfiguration }
    > | null> {
        const command = new ListBucketsCommand(options);
        const response = await this.execute<ListBucketsCommandOutput>(command);

        const responseData = (response?.Buckets || null) as Array<
            Bucket & { PublicAccessBlockConfiguration?: PublicAccessBlockConfiguration }
        > | null;

        if (!responseData) return null;

        if (includePublicAccess) {
            await Promise.allSettled(
                responseData.map(async (data) => {
                    const result = await this.execute<GetPublicAccessBlockCommandOutput>(
                        new GetPublicAccessBlockCommand({ Bucket: data.Name })
                    );
                    data.PublicAccessBlockConfiguration = result.PublicAccessBlockConfiguration;
                })
            );
        }

        return responseData;
    }

    async isBucketExists(): Promise<boolean> {
        const bucketName = this.bucket;

        try {
            await this.execute<HeadBucketCommandOutput>(new HeadBucketCommand({ Bucket: bucketName }));
            return true;
        } catch (err: any) {
            if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
                this.logger?.error(this.reqId, 'Error checking bucket:', err);
                throw err;
            } else {
                return false;
            }
        }
    }

    private async initAsPublicBucket(): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isBucketExists();
        if (isExists) {
            this.logger?.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const data = await this.execute(new CreateBucketCommand({ Bucket: bucketName }));
        CREATE_PUBLICK_ACCESS_BLOCK: {
            const command = new PutPublicAccessBlockCommand({
                Bucket: bucketName,
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: false,
                    IgnorePublicAcls: false,
                    BlockPublicPolicy: false,
                    RestrictPublicBuckets: false,
                },
            });
            await this.execute<PutPublicAccessBlockCommandOutput>(command);
        }

        UPDATE_PUBLICK_ACCESS_POLICY: {
            const policy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Sid: 'PublicReadGetObject',
                        Effect: 'Allow',
                        Principal: '*',
                        Action: 's3:GetObject',
                        Resource: `arn:aws:s3:::${bucketName}/*`,
                    },
                ],
            };

            const command = new PutBucketPolicyCommand({ Bucket: bucketName, Policy: JSON.stringify(policy) });
            await this.execute<PutBucketPolicyCommandOutput>(command);
        }

        this.logger?.info(this.reqId, `Public bucket created successfully.`, { bucketName });

        return data;
    }

    private async initAsPrivateBucket(
        includeConstraintLocation?: boolean
    ): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isBucketExists();
        if (isExists) {
            this.logger?.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const createParams: CreateBucketCommandInput = {
            Bucket: bucketName,
            ...(includeConstraintLocation && {
                CreateBucketConfiguration: { LocationConstraint: this.region as any },
            }),
        };

        const data = await this.execute(new CreateBucketCommand(createParams));
        this.logger?.info(this.reqId, `Private bucket created successfully.`, { bucketName });

        return data;
    }

    async initBucket(
        acl: ACLs = ACLs.private,
        {
            includeConstraintLocation = false,
            skipInitializedBucket = false,
        }: { includeConstraintLocation?: boolean; skipInitializedBucket?: boolean } = {}
    ): Promise<CreateBucketCommandOutput | undefined> {
        const bucketName = this.bucket;
        if (skipInitializedBucket && this.initializedBucket === bucketName) {
            return;
        }

        const isExists = await this.isBucketExists();
        if (isExists) {
            this.logger?.info(this.reqId, `Bucket already exists.`, { bucketName });
            return;
        }

        const data =
            acl === ACLs.private
                ? await this.initAsPrivateBucket(includeConstraintLocation)
                : await this.initAsPublicBucket();

        this.initializedBucket = bucketName;

        return data;
    }

    private async emptyBucket() {
        let ContinuationToken: string | undefined = undefined;
        do {
            const listResp: ListObjectsV2CommandOutput = await this.execute<ListObjectsV2CommandOutput>(
                new ListObjectsV2Command({
                    Bucket: this.bucket,
                    ContinuationToken,
                })
            );

            if (listResp.Contents && listResp.Contents.length > 0) {
                await this.execute<DeleteObjectsCommandOutput>(
                    new DeleteObjectsCommand({
                        Bucket: this.bucket,
                        Delete: {
                            Objects: listResp.Contents.map((obj) => ({ Key: obj.Key! })),
                        },
                    })
                );
            }
            ContinuationToken = listResp.NextContinuationToken;
        } while (ContinuationToken);
    }

    async bucketInfo(options?: Partial<HeadBucketCommandInput>): Promise<BucketInfo> {
        const bucketName = this.bucket;
        const info: any = {
            name: bucketName,
            region: this.region,
            endpoint: this.endpoint,
            exists: false,
        };

        try {
            try {
                const headBucketResponse = await this.execute<HeadBucketCommandOutput>(
                    new HeadBucketCommand({ Bucket: bucketName, ...options })
                );
                this.logger?.debug('bucketInfo', 'HeadBucketCommandOutput', headBucketResponse);

                info.exists = true;
                info.bucketRegion = headBucketResponse.BucketRegion;
                info.accessPointAlias = headBucketResponse.AccessPointAlias;
            } catch (err: any) {
                if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
                    return info;
                }

                throw err;
            }

            // Get bucket creation date from list
            try {
                const buckets = await this.getBucketList({ Prefix: this.bucket, BucketRegion: this.region });
                this.logger?.debug('bucketInfo', 'getBucketList', { buckets });

                const bucket = buckets?.find((b) => b.Name === bucketName);
                if (bucket?.CreationDate) {
                    info.creationDate = bucket.CreationDate;
                }
            } catch (error) {
                this.logger?.warn(this.reqId, 'Failed to get bucket creation date', { bucketName, error });
            }

            try {
                const aclResponse = await this.execute<GetBucketAclCommandOutput>(
                    new GetBucketAclCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketAclCommandOutput', aclResponse);

                info.acl = aclResponse.Grants?.map((grant: any) => ({
                    grantee: grant.Grantee?.Type,
                    permission: grant.Permission,
                }));
            } catch (error) {
                this.logger?.warn(this.reqId, 'Failed to get bucket ACL', { bucketName, error });
            }

            // Get public access block configuration
            try {
                const publicAccessResponse = await this.execute<GetPublicAccessBlockCommandOutput>(
                    new GetPublicAccessBlockCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetPublicAccessBlockCommandOutput', publicAccessResponse);

                info.publicAccessBlock = publicAccessResponse.PublicAccessBlockConfiguration;
            } catch (error: any) {
                if (error.name !== 'NoSuchPublicAccessBlockConfiguration') {
                    this.logger?.warn(this.reqId, 'Failed to get public access block', { bucketName, error });
                }
            }

            // Get bucket policy
            try {
                const policyResponse = await this.execute<GetBucketPolicyCommandOutput>(
                    new GetBucketPolicyCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketPolicyCommandOutput', policyResponse);

                if (policyResponse.Policy) {
                    info.policy = JSON.parse(policyResponse.Policy);
                }
            } catch (error: any) {
                if (error.name !== 'NoSuchBucketPolicy') {
                    this.logger?.warn(this.reqId, 'Failed to get bucket policy', { bucketName, error });
                }
            }

            // Get versioning status
            try {
                const versioningResponse = await this.execute<GetBucketVersioningCommandOutput>(
                    new GetBucketVersioningCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketVersioningCommandOutput', versioningResponse);

                info.versioning = versioningResponse.Status || 'Disabled';
            } catch (error) {
                this.logger?.warn(this.reqId, 'Failed to get bucket versioning', { bucketName, error });
            }

            // Get encryption configuration
            try {
                const encryptionResponse = await this.execute<GetBucketEncryptionCommandOutput>(
                    new GetBucketEncryptionCommand({ Bucket: bucketName })
                );
                this.logger?.debug('bucketInfo', 'GetBucketEncryptionCommandOutput', encryptionResponse);

                info.encryption = {
                    enabled: true,
                    type: encryptionResponse.ServerSideEncryptionConfiguration?.Rules?.[0]
                        ?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
                };
            } catch (error: any) {
                if (error.name === 'ServerSideEncryptionConfigurationNotFoundError') {
                    info.encryption = { enabled: false };
                } else {
                    this.logger?.warn(this.reqId, 'Failed to get bucket encryption', { bucketName, error });
                    info.encryption = { enabled: false };
                }
            }

            this.logger?.debug('bucketInfo', 'bucket info response', info);

            return info;
        } catch (error) {
            this.logger?.error(this.reqId, 'Failed to get bucket info', { bucketName, error });
            throw error;
        }
    }

    async destroyBucket(
        forceDeleteAllFilesBeforeDestroyBucket = false
    ): Promise<DeleteBucketCommandOutput | undefined> {
        const bucketName = this.bucket;

        const isExists = await this.isBucketExists();
        if (!isExists) {
            this.logger?.debug(this.reqId, `Bucket not exists.`, { bucketName });
            return;
        }

        if (forceDeleteAllFilesBeforeDestroyBucket) {
            await this.emptyBucket();
        }

        const createParams: DeleteBucketCommandInput = { Bucket: bucketName };
        const data = await this.execute(new DeleteBucketCommand(createParams));

        return data;
    }
}
