import React, { useState } from 'react';
import {
    TextField,
    Button,
    Alert,
    CircularProgress,
    Paper,
    Box,
    Typography,
    MenuItem,
    InputAdornment,
    Checkbox,
    Tooltip,
    FormControlLabel,
} from '@mui/material';
import { CloudUpload, Public, PublicOff } from '@mui/icons-material';
import { s3Service } from '../services/s3Service.ts';
import { AWSCredentials } from '../types/aws.ts';
import '../styles/login.scss';

interface LoginScreenProps {
    onLoginSuccess: (bucketName: string) => void;
}

const awsRegions = [
    { value: 'us-east-1', label: 'US East (N. Virginia)', default: true },
    { value: 'us-east-2', label: 'US East (Ohio)' },
    { value: 'us-west-1', label: 'US West (N. California)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'EU (Ireland)' },
    { value: 'eu-central-1', label: 'EU (Frankfurt)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
];
const defaultOptionValue = awsRegions.find((v) => v.default)?.value as string;

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [credentials, setCredentials] = useState<AWSCredentials>({
        accessKeyId: '',
        secretAccessKey: '',
        region: defaultOptionValue,
    });
    const [bucketName, setBucketName] = useState('');
    const [isPublicAccess, setIsPublicAccess] = useState(true);
    const [isUseLocalstack, setIsUseLocalstack] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleChange = (field: keyof AWSCredentials) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setCredentials({ ...credentials, [field]: event.target.value });
        setError(null);
        setSuccess(false);
    };

    const handleBucketChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setBucketName(event.target.value);
        setError(null);
        setSuccess(false);
    };

    const handleConnect = async () => {
        if (!credentials.accessKeyId || !credentials.secretAccessKey || !bucketName) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            await s3Service.initialize(credentials, bucketName);
            const isConnected = await s3Service.testConnection();

            if (isConnected) {
                setSuccess(true);
                setTimeout(() => {
                    onLoginSuccess(bucketName);
                }, 500);
            } else {
                setError('Failed to connect. Please check your credentials and bucket name.');
            }
        } catch (err) {
            setError('Connection failed. Please verify your AWS credentials and bucket name.');
            console.error(err);
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
                    <TextField
                        label="Access Key ID"
                        variant="outlined"
                        fullWidth
                        value={credentials.accessKeyId}
                        onChange={handleChange('accessKeyId')}
                        onKeyUp={handleKeyPress}
                        disabled={loading}
                        className="form-field"
                        required
                    />

                    <TextField
                        label="Secret Access Key"
                        variant="outlined"
                        type="password"
                        fullWidth
                        value={credentials.secretAccessKey}
                        onChange={handleChange('secretAccessKey')}
                        onKeyUp={handleKeyPress}
                        disabled={loading}
                        className="form-field"
                        required
                    />

                    <TextField
                        label="Region"
                        variant="outlined"
                        select
                        fullWidth
                        value={credentials.region}
                        onChange={handleChange('region')}
                        className="form-field"
                        required
                        disabled={loading || isUseLocalstack}
                    >
                        {awsRegions.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.label}{' '}
                                <span style={{ position: 'absolute', right: '24px', color: '#8a8a8a' }}>
                                    {option.value}
                                </span>
                            </MenuItem>
                        ))}
                    </TextField>

                    <TextField
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
                        slotProps={{
                            input: {
                                endAdornment: (
                                    <InputAdornment position="end" sx={{ margin: 'auto' }}>
                                        <Tooltip
                                            title={isPublicAccess ? 'Public bucket access' : 'Private bucket access'}
                                        >
                                            <Checkbox
                                                icon={<PublicOff />}
                                                checkedIcon={<Public />}
                                                color={'primary'}
                                                checked={isPublicAccess}
                                                onChange={(e) => setIsPublicAccess(e.target.checked)}
                                            />
                                        </Tooltip>
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />

                    <FormControlLabel
                        sx={{ paddingX: 1.5 }}
                        label={<Typography>Localstack</Typography>}
                        control={
                            <Checkbox
                                color="primary"
                                checked={isUseLocalstack}
                                onChange={(e) => {
                                    setIsUseLocalstack(e.target.checked);
                                    if (e.target.checked) {
                                        setCredentials({ ...credentials, region: defaultOptionValue });
                                    }
                                }}
                            />
                        }
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

                    {error && (
                        <Alert severity="error" className="status-message">
                            {error}
                        </Alert>
                    )}

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
