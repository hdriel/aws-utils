import React, { useState } from 'react';
import { Paper, Box } from '@mui/material';
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
} from 'mui-simple';
import { CloudUpload, Public, PublicOff } from '@mui/icons-material';
import { s3Service } from '../services/s3Service.ts';
import { AWSCredentials } from '../types/aws.ts';
import '../styles/login.scss';

interface LoginScreenProps {
    onLoginSuccess: (bucketName: string, localstack: boolean) => void;
}

const awsRegions = [
    { value: 'us-east-2', label: 'US East (Ohio)' },
    { value: 'us-east-1', label: 'US East (N. Virginia)', default: true },
    { value: 'us-west-1', label: 'US West (N. California)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'af-south-1', label: 'Africa (Cape Town)' },
    { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
    { value: 'ap-south-2', label: 'Asia Pacific (Hyderabad)' },
    { value: 'ap-southeast-3', label: 'Asia Pacific (Jakarta)' },
    { value: 'ap-southeast-5', label: 'Asia Pacific (Malaysia)' },
    { value: 'ap-southeast-4', label: 'Asia Pacific (Melbourne)' },
    { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
    { value: 'ap-southeast-6', label: 'Asia Pacific (New Zealand)' },
    { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
    { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
    { value: 'ap-east-2', label: 'Asia Pacific (Taipei)' },
    { value: 'ap-southeast-7', label: 'Asia Pacific (Thailand)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
    { value: 'ca-central-1', label: 'Canada (Central)' },
    { value: 'ca-west-1', label: 'Canada West (Calgary)' },
    { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
    { value: 'eu-west-1', label: 'Europe (Ireland)' },
    { value: 'eu-west-2', label: 'Europe (London)' },
    { value: 'eu-south-1', label: 'Europe (Milan)' },
    { value: 'eu-west-3', label: 'Europe (Paris)' },
    { value: 'eu-south-2', label: 'Europe (Spain)' },
    { value: 'eu-north-1', label: 'Europe (Stockholm)' },
    { value: 'eu-central-2', label: 'Europe (Zurich)' },
    { value: 'il-central-1', label: 'Israel (Tel Aviv)' },
    { value: 'mx-central-1', label: 'Mexico (Central)' },
    { value: 'me-south-1', label: 'Middle East (Bahrain)' },
    { value: 'me-central-1', label: 'Middle East (UAE)' },
    { value: 'sa-east-1', label: 'South America (São Paulo)' },
    { value: 'us-gov-east-1', label: 'AWS GovCloud (US-East)' },
    { value: 'us-gov-west-1', label: 'AWS GovCloud (US-West)' },
];
const defaultOptionValue = awsRegions.find((v) => v.default)?.value as string;

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [credentials, setCredentials] = useState<AWSCredentials>({
        accessKeyId: import.meta.env.VITE_LOCALSTACK_ACCESS_KEY_ID ?? '',
        secretAccessKey: import.meta.env.VITE_LOCALSTACK_SECRET_ACCESS_KEY ?? '',
        region: import.meta.env.VITE_LOCALSTACK_AWS_REGION ?? defaultOptionValue,
    });
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
            const isConnected = await s3Service.isConnected();

            if (isConnected) {
                localStorage.setItem('localstack', isLocalstack ? '1' : '0');
                setSuccess(true);
                setTimeout(() => {
                    onLoginSuccess(bucketName, isLocalstack);
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
                        options={awsRegions.map((option) => ({ ...option, subtitle: option.value }))}
                    />

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
