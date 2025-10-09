import { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LoginScreen } from './components/LoginScreen.tsx';
import { MainScreen } from './components/MainScreen';

const theme = createTheme({
    palette: {
        primary: {
            main: '#667eea',
        },
        secondary: {
            main: '#764ba2',
        },
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    },
});

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [bucketName, setBucketName] = useState('');
    const [isLocalstack, setIsLocalstack] = useState(false);

    const handleLoginSuccess = (bucket: string, localstack: boolean) => {
        setBucketName(bucket);
        setIsAuthenticated(true);
        setIsLocalstack(localstack);
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        setBucketName('');
    };

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {isAuthenticated ? (
                <MainScreen bucketName={bucketName} localstack={isLocalstack} onLogout={handleLogout} />
            ) : (
                <LoginScreen onLoginSuccess={handleLoginSuccess} />
            )}
        </ThemeProvider>
    );
}

export default App;
