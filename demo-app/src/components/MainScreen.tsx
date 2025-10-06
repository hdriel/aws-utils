import React, { useState } from 'react';
import { Button, Typography, Box } from '@mui/material';
import { LogoutOutlined, Storage } from '@mui/icons-material';
import { TreePanel } from './TreePanel';
import { FilePanel } from './FilePanel';
import { s3Service } from '../services/s3Service';
import '../styles/mainScreen.scss';

interface MainScreenProps {
    bucketName: string;
    onLogout: () => void;
}

export const MainScreen: React.FC<MainScreenProps> = ({ bucketName, onLogout }) => {
    const [currentPath, setCurrentPath] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleLogout = () => {
        s3Service.disconnect();
        onLogout();
    };

    const handleRefresh = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    return (
        <div className="main-screen">
            <Box className="header">
                <Box className="header-title">
                    <Storage />
                    <Box>
                        <Typography variant="h6" component="h1">
                            AWS S3 File Explorer
                        </Typography>
                        <Typography variant="caption" className="bucket-info">
                            Bucket: {bucketName}
                        </Typography>
                    </Box>
                </Box>
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<LogoutOutlined />}
                    onClick={handleLogout}
                    className="logout-button"
                >
                    Logout
                </Button>
            </Box>

            <Box className="content">
                <TreePanel
                    bucketName={bucketName}
                    onFolderSelect={setCurrentPath}
                    onRefresh={handleRefresh}
                    refreshTrigger={refreshTrigger}
                />
                <FilePanel currentPath={currentPath} onRefresh={handleRefresh} />
            </Box>
        </div>
    );
};
