import React, { useState } from 'react';
import { Box } from '@mui/material';
import { Button, Typography, SVGIcon } from 'mui-simple';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { LogoutOutlined } from '@mui/icons-material';
import { TreePanel } from './TreePanel';
import { FilePanel } from './FilePanel';
import { s3Service } from '../services/s3Service';
import '../styles/mainScreen.scss';

interface MainScreenProps {
    bucketName: string;
    localstack: boolean;
    onLogout: () => void;
}

export const MainScreen: React.FC<MainScreenProps> = ({ bucketName, onLogout, localstack }) => {
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
                    <SVGIcon muiIconName="Storage" color="white" size={30} />
                    <Box>
                        <Typography variant="h6" component="h1" color={'#ececec'}>
                            AWS S3 File Explorer
                        </Typography>
                        <Typography variant="caption" className="bucket-info" color="grey">
                            Bucket: {bucketName}
                        </Typography>
                    </Box>
                </Box>
                <Button
                    variant="contained"
                    color="error"
                    startIcon={<LogoutOutlined />}
                    onClick={handleLogout}
                    className="logout-button"
                    label="Logout"
                />
            </Box>

            <Box className="content">
                <PanelGroup autoSaveId="example" direction="horizontal" style={{ width: '100%', height: '100%' }}>
                    <Panel defaultSize={25} minSize={15} style={{ width: '100%', height: '100%' }}>
                        <TreePanel
                            bucketName={bucketName}
                            onFolderSelect={setCurrentPath}
                            onRefresh={handleRefresh}
                            refreshTrigger={refreshTrigger}
                            localstack={!localstack}
                        />
                    </Panel>
                    <PanelResizeHandle />
                    <Panel minSize={50} style={{ width: '100%', height: '100%' }}>
                        <FilePanel currentPath={currentPath} onRefresh={handleRefresh} />
                    </Panel>
                </PanelGroup>
            </Box>
        </div>
    );
};
