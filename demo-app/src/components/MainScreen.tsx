import React, { useState } from 'react';
import { Box, Stack, useMediaQuery, useTheme } from '@mui/material';
import { Button, Typography, SVGIcon, Chip, Tooltip } from 'mui-simple';
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
    const theme = useTheme();
    const mobileLayout = useMediaQuery((theme) => theme.breakpoints.down('md'));

    const [currentPath, setCurrentPath] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleLogout = () => {
        return s3Service.disconnect().then(() => onLogout());
    };

    const handleRefresh = () => {
        setRefreshTrigger((prev) => prev + 1);
    };

    return (
        <div className="main-screen">
            <Box className="header">
                <Box className="header-title">
                    <SVGIcon muiIconName="Storage" color="white" size={mobileLayout ? 25 : 30} />
                    <Box>
                        <Typography variant="h6" component="h1" color={'#ececec'}>
                            AWS S3 File Explorer
                        </Typography>
                        <Stack direction="row" spacing={mobileLayout ? 0 : 2}>
                            <Typography variant="caption" color={'#ececec'} size={mobileLayout ? 15 : 17}>
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
                                color={isPublicAccess ? 'info' : 'success'}
                                startIcon={
                                    <SVGIcon size="15px" muiIconName={isPublicAccess ? 'Public' : 'PublicOff'} />
                                }
                                endIcon={
                                    localstack ? (
                                        <Tooltip title="Are you sure you want to delete this bucket ??">
                                            <SVGIcon size="18px" muiIconName="DeleteForever" />
                                        </Tooltip>
                                    ) : undefined
                                }
                                onDelete={
                                    localstack
                                        ? () => {
                                              return s3Service
                                                  .deleteLocalstackBucket(bucketName)
                                                  .then(() => {
                                                      handleLogout();
                                                  })
                                                  .catch(() => alert('Failed to delete localstack bucket'));
                                          }
                                        : undefined
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

                {mobileLayout ? (
                    <Button
                        variant="contained"
                        color={'#FFFFFF'}
                        icon={<LogoutOutlined />}
                        onClick={handleLogout}
                        className="logout-button"
                    />
                ) : (
                    <Button
                        variant="outlined"
                        color="#FFFFFF"
                        startIcon={<LogoutOutlined />}
                        onClick={handleLogout}
                        className="logout-button"
                        label="Logout"
                    />
                )}
            </Box>

            <Box className="content">
                <PanelGroup
                    autoSaveId="example"
                    direction={mobileLayout ? 'vertical' : 'horizontal'}
                    style={{ width: '100%', height: '100%' }}
                >
                    <Panel
                        defaultSize={mobileLayout ? 10 : 35}
                        minSize={mobileLayout ? 15 : 18}
                        style={{ width: '100%', height: '100%', borderRadius: '20px' }}
                    >
                        <TreePanel
                            bucketName={bucketName}
                            onFolderSelect={setCurrentPath}
                            onRefresh={handleRefresh}
                            refreshTrigger={refreshTrigger}
                            localstack={localstack}
                        />
                    </Panel>
                    <PanelResizeHandle
                        style={{
                            background: theme.palette.primary.main,
                            ...(mobileLayout ? { width: '100%', height: '5px' } : { width: '3px', height: '100%' }),
                        }}
                    />
                    <Panel
                        minSize={mobileLayout ? 35 : 50}
                        style={{ width: '100%', height: '100%', borderRadius: '20px' }}
                    >
                        <FilePanel currentPath={currentPath} onRefresh={handleRefresh} />
                    </Panel>
                </PanelGroup>
            </Box>
        </div>
    );
};

// MainScreen.whyDidYouRender = true;

export default MainScreen;
