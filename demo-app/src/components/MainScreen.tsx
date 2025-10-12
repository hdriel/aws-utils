import React, { useState } from 'react';
import { Box, Stack } from '@mui/material';
import { Button, Typography, SVGIcon, Chip } from 'mui-simple';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { LogoutOutlined } from '@mui/icons-material';
import TreePanel from './TreePanel';
import FilePanel from './FilePanel';
import { s3Service } from '../services/s3Service';
import '../styles/mainScreen.scss';

interface MainScreenProps {
    bucketName: string;
    bucketAccess: 'private' | 'public';
    localstack: boolean;
    onLogout: () => void;
}

const MainScreen: React.FC<MainScreenProps> = ({ bucketName, bucketAccess, onLogout, localstack }) => {
    const isPublicAccess = bucketAccess === 'public';

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
                        <Stack direction="row" spacing={2}>
                            <Typography variant="caption" color={'#ececec'} size={17}>
                                Bucket:
                            </Typography>
                            <Chip
                                label={bucketName}
                                sx={{
                                    marginInlineStart: '1em',
                                    height: '28px',
                                    paddingInlineEnd: '5px',
                                    borderRadius: '5px',
                                }}
                                color={isPublicAccess ? 'info' : 'warning'}
                                textColor={isPublicAccess ? '#FFFFFF' : '#000000'}
                                endIcon={
                                    <SVGIcon
                                        size="17px"
                                        muiIconName={isPublicAccess ? 'Public' : 'PublicOff'}
                                        color={isPublicAccess ? '#FFFFFF' : '#000000'}
                                    />
                                }
                            />
                            {localstack && (
                                <Chip
                                    label="localstack"
                                    color="secondary"
                                    sx={{ marginInlineStart: '1em', height: '28px', borderRadius: '5px' }}
                                />
                            )}
                        </Stack>
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

// MainScreen.whyDidYouRender = true;

export default MainScreen;
