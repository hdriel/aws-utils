import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    LinearProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    InputAdornment,
    Checkbox,
} from '@mui/material';
import { Typography, Button } from 'mui-simple';

import { Image, VideoLibrary, InsertDriveFile, FolderOpen } from '@mui/icons-material';
import JSZip from 'jszip';
import { s3Service } from '../services/s3Service.ts';
import { formatFileSize, isVideoFile, isImageFile, downloadFile } from '../utils/fileUtils.ts';
import { S3File } from '../types/aws.ts';
import '../styles/filePanel.scss';

interface FilePanelProps {
    currentPath: string;
    onRefresh: () => void;
}

export const FilePanel: React.FC<FilePanelProps> = ({ currentPath, onRefresh }) => {
    const [files, setFiles] = useState<S3File[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadingFileName, setUploadingFileName] = useState('');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tagDialogOpen, setTagDialogOpen] = useState(false);
    const [versionTag, setVersionTag] = useState('');
    const [tempLink, setTempLink] = useState('');
    const [linkDialogOpen, setLinkDialogOpen] = useState(false);
    const [videoPreviewUrl, setVideoPreviewUrl] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadFiles();
    }, [currentPath]);

    const loadFiles = async () => {
        try {
            const { files: loadedFiles } = await s3Service.listObjects(currentPath);
            setFiles(loadedFiles.filter((f) => f.type === 'file'));
            setSelectedFiles(new Set());
            setVideoPreviewUrl('');
            setTempLink('');
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    };

    const handleFileSelect = (fileKey: string) => {
        const newSelected = new Set(selectedFiles);
        if (newSelected.has(fileKey)) {
            newSelected.delete(fileKey);
        } else {
            newSelected.add(fileKey);
        }
        setSelectedFiles(newSelected);

        if (newSelected.size === 1) {
            const file = files.find((f) => f.key === fileKey);
            if (file && isVideoFile(file.name)) {
                generatePreview(fileKey);
            } else {
                setVideoPreviewUrl('');
            }
        } else {
            setVideoPreviewUrl('');
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setUploadProgress(0);
        setUploadingFileName(file.name);

        try {
            const filePath = currentPath ? `${currentPath}${file.name}` : `/${file.name}`;
            await s3Service.uploadFile(file, filePath, (progress) => {
                setUploadProgress(progress);
            });

            await loadFiles();
            onRefresh();
        } catch (error) {
            console.error('Failed to upload file:', error);
        } finally {
            setUploading(false);
            setUploadProgress(0);
            setUploadingFileName('');
            if (event.target) {
                event.target.value = '';
            }
        }
    };

    const handleDownload = async () => {
        if (selectedFiles.size === 0) return;

        try {
            if (selectedFiles.size === 1) {
                const fileKey = Array.from(selectedFiles)[0];
                const url = await s3Service.getSignedUrl(fileKey, 3600);
                const fileName = files.find((f) => f.key === fileKey)?.name || 'download';
                await downloadFile(url, fileName);
            } else {
                await downloadMultipleAsZip();
            }
        } catch (error) {
            console.error('Failed to download:', error);
        }
    };

    const downloadMultipleAsZip = async () => {
        const zip = new JSZip();

        for (const fileKey of Array.from(selectedFiles)) {
            try {
                const file = files.find((f) => f.key === fileKey);
                if (!file) continue;

                const obj = await s3Service.getObject(fileKey);
                const body = obj.Body as Uint8Array;
                zip.file(file.name, body);
            } catch (error) {
                console.error(`Failed to add ${fileKey} to zip:`, error);
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        await downloadFile(url, 'files.zip');
        URL.revokeObjectURL(url);
    };

    const handleDelete = async () => {
        if (selectedFiles.size === 0) return;

        try {
            for (const fileKey of Array.from(selectedFiles)) {
                await s3Service.deleteObject(fileKey);
            }

            setDeleteDialogOpen(false);
            setSelectedFiles(new Set());
            await loadFiles();
            onRefresh();
        } catch (error) {
            console.error('Failed to delete files:', error);
        }
    };

    const handleTagVersion = async () => {
        if (selectedFiles.size !== 1 || !versionTag.trim()) return;

        try {
            const fileKey = Array.from(selectedFiles)[0];
            await s3Service.tagObject(fileKey, versionTag);
            setTagDialogOpen(false);
            setVersionTag('');
        } catch (error) {
            console.error('Failed to tag file:', error);
        }
    };

    const generatePreview = async (fileKey: string) => {
        try {
            const url = await s3Service.getSignedUrl(fileKey, 3600);
            setVideoPreviewUrl(url);
        } catch (error) {
            console.error('Failed to generate preview:', error);
        }
    };

    const generateTempLink = async () => {
        if (selectedFiles.size !== 1) return;

        try {
            const fileKey = Array.from(selectedFiles)[0];
            const url = await s3Service.getSignedUrl(fileKey, 3600);
            setTempLink(url);
            setLinkDialogOpen(true);
        } catch (error) {
            console.error('Failed to generate link:', error);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(tempLink);
    };

    return (
        <div className="file-panel">
            <div className="file-header">
                <Typography variant="h6" component="h2">
                    File Management
                </Typography>
                <Typography className="current-path">{currentPath || '/ (root)'}</Typography>
            </div>

            <div className="file-content">
                <Box className="upload-section">
                    <Typography variant="subtitle1" component="h3">
                        Upload Files
                    </Typography>
                    <Box className="upload-buttons">
                        <Button
                            variant="contained"
                            startIcon="CloudUpload"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            label="Upload File"
                        />
                        <Button
                            variant="outlined"
                            startIcon="Image"
                            onClick={() => imageInputRef.current?.click()}
                            disabled={uploading}
                            label="Upload Image"
                        />

                        <Button
                            variant="outlined"
                            startIcon="VideoLibrary"
                            onClick={() => videoInputRef.current?.click()}
                            disabled={uploading}
                            label="Upload Video"
                        />
                    </Box>

                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                    <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                    <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />

                    {uploading && (
                        <Box className="upload-progress">
                            <Box className="progress-info">
                                <Typography variant="body2">Uploading: {uploadingFileName}</Typography>
                                <Typography variant="body2">{Math.round(uploadProgress)}%</Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={uploadProgress} />
                        </Box>
                    )}
                </Box>

                {files.length > 0 ? (
                    <>
                        <Box className="file-list">
                            <Box className="file-list-header">
                                <Typography variant="subtitle1" component="h3">
                                    Files in Current Folder
                                </Typography>
                                {selectedFiles.size > 0 && (
                                    <Typography className="selection-info">
                                        {selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''} selected
                                    </Typography>
                                )}
                            </Box>

                            <Box className="file-items">
                                {files.map((file) => (
                                    <Box
                                        key={file.key}
                                        className={`file-item ${selectedFiles.has(file.key) ? 'selected' : ''}`}
                                        onClick={() => handleFileSelect(file.key)}
                                    >
                                        <Box className="file-info">
                                            <Checkbox
                                                checked={selectedFiles.has(file.key)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleFileSelect(file.key);
                                                }}
                                            />
                                            <Box className="file-icon">
                                                {isImageFile(file.name) ? (
                                                    <Image />
                                                ) : isVideoFile(file.name) ? (
                                                    <VideoLibrary />
                                                ) : (
                                                    <InsertDriveFile />
                                                )}
                                            </Box>
                                            <Box className="file-details">
                                                <Typography className="file-name">{file.name}</Typography>
                                                <Typography className="file-meta">
                                                    {formatFileSize(file.size)} • {file.lastModified.toLocaleString()}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        {selectedFiles.size > 0 && (
                            <Box className="file-actions">
                                <Typography variant="subtitle1" component="h3">
                                    Actions
                                </Typography>
                                <Box className="actions-grid">
                                    <Button variant="outlined" startIcon="Download" onClick={handleDownload}>
                                        Download {selectedFiles.size > 1 ? 'as ZIP' : ''}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        startIcon="Delete"
                                        onClick={() => setDeleteDialogOpen(true)}
                                        label="Delete Selected"
                                    />

                                    {selectedFiles.size === 1 && (
                                        <>
                                            <Button
                                                variant="outlined"
                                                startIcon="Label"
                                                onClick={() => setTagDialogOpen(true)}
                                                label="Tag Version"
                                            />
                                            <Button
                                                variant="outlined"
                                                startIcon="Link"
                                                onClick={generateTempLink}
                                                label="Generate Link"
                                            />
                                        </>
                                    )}
                                </Box>

                                {videoPreviewUrl && (
                                    <Box className="video-preview">
                                        <video controls src={videoPreviewUrl}>
                                            Your browser does not support the video tag.
                                        </video>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </>
                ) : (
                    <Box className="empty-state">
                        <FolderOpen className="empty-icon" />
                        <Typography variant="h6" component="h3">
                            No Files
                        </Typography>
                        <Typography variant="body2">Upload files to get started</Typography>
                    </Box>
                )}
            </div>

            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete {selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''}?
                        This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleDelete} variant="contained" color="error">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={tagDialogOpen} onClose={() => setTagDialogOpen(false)}>
                <DialogTitle>Tag File Version</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Version"
                        fullWidth
                        placeholder="e.g., 1.0.0"
                        value={versionTag}
                        onChange={(e) => setVersionTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleTagVersion()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTagDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleTagVersion} variant="contained">
                        Apply Tag
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Temporary Link</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        This link will expire in 1 hour
                    </Typography>
                    <TextField
                        fullWidth
                        value={tempLink}
                        InputProps={{
                            readOnly: true,
                            endAdornment: (
                                <InputAdornment position="end">
                                    <Button onClick={copyToClipboard} edge="end" icon="ContentCopy" />
                                </InputAdornment>
                            ),
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setLinkDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};
