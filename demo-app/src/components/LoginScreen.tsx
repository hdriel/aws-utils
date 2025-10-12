import React, { useEffect, useState } from 'react';
import { Paper, Box, ListItem, ListItemAvatar, ListItemText, ListItemSecondaryAction } from '@mui/material';
import {
    Checkbox,
    InputText,
    InputPassword,
    InputSelect,
    CircularProgress,
    Button,
    Typography,
    Tooltip,
    Alert,
    InputAutocomplete,
    Avatar,
} from 'mui-simple';
import { CloudUpload, Public, PublicOff } from '@mui/icons-material';
import { s3Service } from '../services/s3Service.ts';
import { AWSCredentials, BucketInfo } from '../types/aws.ts';
import '../styles/login.scss';
import { AWS_REGIONS } from '../consts.ts';

interface LoginScreenProps {
    onLoginSuccess: (bucketInfo: BucketInfo, localstack: boolean) => void;
}

const defaultOptionValue = AWS_REGIONS.find((v) => v.default)?.value as string;

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [credentials, setCredentials] = useState<AWSCredentials>({
        accessKeyId: import.meta.env.VITE_LOCALSTACK_ACCESS_KEY_ID ?? '',
        secretAccessKey: import.meta.env.VITE_LOCALSTACK_SECRET_ACCESS_KEY ?? '',
        region: import.meta.env.VITE_LOCALSTACK_AWS_REGION ?? defaultOptionValue,
    });
    const [localstackBuckets, setLocalstackBuckets] = useState<
        Array<{ label: string; id: string; [key: string]: any }>
    >([]);
    const [bucketName, setBucketName] = useState('demo');
    const [isPublicAccess, setIsPublicAccess] = useState(false);
    const [isLocalstack, setIsLocalstack] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string[]>([]);
    const [success, setSuccess] = useState(false);

    const handleChange = (field: keyof AWSCredentials) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setCredentials({ ...credentials, [field]: event.target.value });
        setError([]);
        setSuccess(false);
    };

    const handleBucketChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setBucketName(event.target.value);
        setError([]);
        setSuccess(false);
    };

    const handleAutocompleteBucketChange = (_event: React.ChangeEvent<HTMLInputElement>, optionId: string | number) => {
        setBucketName(optionId as string);
        setError([]);
        setSuccess(false);
    };

    const handleConnect = async () => {
        if (!credentials.accessKeyId || !credentials.secretAccessKey || !bucketName) {
            setError(['Please fill in all fields']);
            return;
        }

        setLoading(true);
        setError([]);
        setSuccess(false);

        try {
            await s3Service.initialize(credentials, bucketName, isPublicAccess, isLocalstack);
            const bucketInfo = await s3Service.getConnectedBucketInfo();

            if (bucketInfo) {
                localStorage.setItem('localstack', isLocalstack ? '1' : '0');
                setSuccess(true);
                setTimeout(() => {
                    onLoginSuccess(bucketInfo, isLocalstack);
                }, 500);
            } else {
                setError(['Failed to connect.', 'Please check your credentials and bucket name.']);
            }
        } catch (err: any) {
            setError([
                'Connection failed.',
                'Please verify your AWS credentials and bucket name.',
                `Error: ${err.response?.data?.message}`,
            ]);

            console.error(err.response?.data?.message);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            return handleConnect();
        }
    };

    const loadLocalstackBucketList = () => {
        return s3Service
            .localstackBucketsList()
            .then((buckets) => {
                setLocalstackBuckets(
                    buckets.map(({ Name, BucketRegion, CreationDate }) => ({
                        id: Name,
                        label: Name,
                        region: BucketRegion,
                        date: new Date(CreationDate),
                    }))
                );
            })
            .catch(console.error);
    };

    useEffect(() => {
        loadLocalstackBucketList();
    }, []);

    return (
        <div className="login-container">
            <Paper className="login-card" elevation={3}>
                <div className="login-header">
                    <CloudUpload sx={{ fontSize: 48, color: '#667eea', mb: 2 }} />
                    <Typography variant="h4" component="h1">
                        AWS S3 File Explorer
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        Enter your AWS credentials to access your S3 bucket
                    </Typography>
                </div>

                <Box className="login-form">
                    <InputText
                        label="Access Key ID"
                        variant="outlined"
                        fullWidth
                        value={credentials.accessKeyId}
                        onChange={handleChange('accessKeyId')}
                        onKeyUp={handleKeyPress}
                        disabled={loading || isLocalstack}
                        className="form-field"
                        required
                    />

                    <InputPassword
                        label="Secret Access Key"
                        variant="outlined"
                        type="password"
                        fullWidth
                        value={credentials.secretAccessKey}
                        onChange={handleChange('secretAccessKey')}
                        onKeyUp={handleKeyPress}
                        disabled={loading || isLocalstack}
                        className="form-field"
                        required
                        generateRandomAction={false}
                        copyAction={false}
                    />

                    <InputSelect
                        label="Region"
                        variant="outlined"
                        select
                        fullWidth
                        value={credentials.region}
                        onChange={handleChange('region')}
                        className="form-field"
                        required
                        disabled={loading || isLocalstack}
                        options={AWS_REGIONS.map((option) => ({ ...option, subtitle: option.value }))}
                    />

                    {isLocalstack ? (
                        <InputAutocomplete
                            label="Bucket Name"
                            variant="outlined"
                            creationAllowed
                            fullWidth
                            value={bucketName}
                            onChange={handleAutocompleteBucketChange}
                            onKeyUp={handleKeyPress}
                            disabled={loading}
                            className="form-field"
                            required
                            renderOption={(props, option, { selected }) => {
                                return (
                                    <ListItem {...props} color={selected ? 'primary' : undefined}>
                                        <ListItemAvatar>
                                            <Avatar icon="Public" />
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={option.label}
                                            secondary={`Created at: ${option.date.toLocaleString()}`}
                                        />
                                        <ListItemSecondaryAction>
                                            <Button
                                                icon="DeleteForever"
                                                tooltipProps={{
                                                    title: `Delete forever bucket: ${option.label}`,
                                                    placement: 'left',
                                                }}
                                                onClick={() => {
                                                    s3Service
                                                        .deleteLocalstackBucket(option.id)
                                                        .then(() => loadLocalstackBucketList())
                                                        .catch(console.error);
                                                }}
                                            />
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                );
                            }}
                            options={localstackBuckets}
                            helperText="Enter the name of your S3 bucket"
                            endCmpExternal={
                                <Tooltip title={isPublicAccess ? 'Public bucket access' : 'Private bucket access'}>
                                    <Checkbox
                                        icon={<PublicOff />}
                                        checkedIcon={<Public />}
                                        color={'primary'}
                                        checked={isPublicAccess}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            setIsPublicAccess(e.target.checked);
                                        }}
                                    />
                                </Tooltip>
                            }
                        />
                    ) : (
                        <InputText
                            label="Bucket Name"
                            variant="outlined"
                            fullWidth
                            value={bucketName}
                            onChange={handleBucketChange}
                            onKeyUp={handleKeyPress}
                            disabled={loading}
                            className="form-field"
                            required
                            helperText="Enter the name of your S3 bucket"
                            endCmp={
                                <Tooltip title={isPublicAccess ? 'Public bucket access' : 'Private bucket access'}>
                                    <Checkbox
                                        icon={<PublicOff />}
                                        checkedIcon={<Public />}
                                        color={'primary'}
                                        checked={isPublicAccess}
                                        onChange={(e) => setIsPublicAccess(e.target.checked)}
                                    />
                                </Tooltip>
                            }
                        />
                    )}

                    <Checkbox
                        color="primary"
                        label={'Localstack'}
                        checked={isLocalstack}
                        onChange={(e) => {
                            setIsLocalstack(e.target.checked);
                            if (e.target.checked) {
                                setCredentials({
                                    accessKeyId: import.meta.env.VITE_LOCALSTACK_ACCESS_KEY_ID ?? '',
                                    secretAccessKey: import.meta.env.VITE_LOCALSTACK_SECRET_ACCESS_KEY ?? '',
                                    region: import.meta.env.VITE_LOCALSTACK_AWS_REGION ?? defaultOptionValue,
                                });
                            }
                        }}
                    />

                    <Button
                        variant="contained"
                        fullWidth
                        onClick={handleConnect}
                        disabled={loading}
                        className="connect-button"
                        startIcon={loading ? <CircularProgress size={20} /> : null}
                    >
                        {loading ? 'Connecting...' : 'Connect to S3'}
                    </Button>

                    {error?.length ? (
                        <Alert severity="error" className="status-message">
                            {error.map((err, index) => (
                                <p key={index}>{err}</p>
                            ))}
                        </Alert>
                    ) : null}

                    {success && (
                        <Alert severity="success" className="status-message">
                            Connected successfully! Loading file explorer...
                        </Alert>
                    )}
                </Box>
            </Paper>
        </div>
    );
};

// LoginScreen.whyDidYouRender = true;

export default LoginScreen;
