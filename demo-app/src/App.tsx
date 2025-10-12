import { useEffect, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import LoginScreen from './components/LoginScreen';
import MainScreen from './components/MainScreen';
import { s3Service } from './services/s3Service.ts';
import { BucketInfo } from './types/aws.ts';

const theme = createTheme({
    palette: {
        primary: { main: '#667eea' },
        secondary: { main: '#764ba2' },
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
});

function App() {
    const [loading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [bucketName, setBucketName] = useState('');
    const [bucketAccess, setBucketAccess] = useState<'private' | 'public'>('private');
    const [isLocalstack, setIsLocalstack] = useState(false);

    const handleLoginSuccess = (bucketInfo: BucketInfo, localstack: boolean) => {
        setBucketName(bucketInfo.name);
        setBucketAccess(bucketInfo.publicAccessBlock?.BlockPublicPolicy ? 'private' : 'public');
        setIsAuthenticated(true);
        setIsLocalstack(localstack);
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        setBucketName('');
        s3Service.disconnect();
    };

    useEffect(() => {
        s3Service
            .getConnectedBucketInfo()
            .then((bucketInfo) => {
                if (bucketInfo) {
                    setIsAuthenticated(!!bucketInfo);
                    setBucketName(bucketInfo.name);
                    setBucketAccess(bucketInfo.publicAccessBlock?.BlockPublicPolicy ? 'private' : 'public');
                    const localstack = !!+(localStorage.getItem('localstack') ?? '0');
                    setIsLocalstack(localstack);
                } else {
                    localStorage.removeItem('localstack');
                }
            })
            .catch(() => {
                localStorage.removeItem('localstack');
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    return loading ? null : (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {isAuthenticated ? (
                <MainScreen
                    bucketName={bucketName}
                    bucketAccess={bucketAccess}
                    localstack={isLocalstack}
                    onLogout={handleLogout}
                />
            ) : (
                <LoginScreen onLoginSuccess={handleLoginSuccess} />
            )}
        </ThemeProvider>
    );
}

export default App;
