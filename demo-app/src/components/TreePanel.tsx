import React, { useState, useEffect } from 'react';
import {
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Typography,
    Box,
} from '@mui/material';
import { SimpleTreeView, TreeItem } from '@mui/x-tree-view';
import { Folder, FolderOpen, InsertDriveFile, Add, Delete, ChevronRight, ExpandMore } from '@mui/icons-material';
import { s3Service } from '../services/s3Service.ts';
import { formatFileSize } from '../utils/fileUtils.ts';
import '../styles/treeView.scss';

interface TreePanelProps {
    onFolderSelect: (path: string) => void;
    onRefresh: () => void;
    bucketName: string;
    refreshTrigger: number;
}

interface TreeNode {
    id: string;
    name: string;
    type: 'file' | 'folder';
    size?: number;
    path: string;
    children?: TreeNode[];
}

export const TreePanel: React.FC<TreePanelProps> = ({ bucketName, onFolderSelect, onRefresh, refreshTrigger }) => {
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [expanded, setExpanded] = useState<string[]>(['root']);
    const [selected, setSelected] = useState<string>('root');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadRootFiles();
    }, [refreshTrigger]);

    const loadRootFiles = async () => {
        try {
            const response = await s3Service.listObjects(bucketName);
            const nodes = buildTreeFromFiles(response);
            setTreeData(nodes);
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    };

    const buildTreeFromFiles = ({ files, directories }: { directories: string[]; files: any[] }): TreeNode[] => {
        const nodes: TreeNode[] = [];

        directories.forEach((directory) => {
            const node: TreeNode = {
                id: directory,
                name: directory,
                type: 'folder',
                path: directory,
            };

            node.children = [];

            nodes.push(node);
        });

        files.forEach((file) => {
            const node: TreeNode = {
                id: file.key,
                name: file.name,
                type: file.type,
                size: file.size,
                path: file.key,
            };

            nodes.push(node);
        });

        return nodes;
    };

    const handleNodeToggle = async (_event: any, nodeId: string, isSelected: boolean) => {
        if (expanded.includes(nodeId)) {
            setExpanded(expanded.filter((id) => id !== nodeId));
        } else {
            setExpanded([...expanded, nodeId]);

            const node = findNodeById(treeData, nodeId);
            if (node && node.type === 'folder' && (!node.children || node.children.length === 0)) {
                try {
                    const files = await s3Service.listObjects(node.path);
                    const children = buildTreeFromFiles(files);
                    updateNodeChildren(nodeId, children);
                } catch (error) {
                    console.error('Failed to load folder contents:', error);
                }
            }
        }
    };

    const findNodeById = (nodes: TreeNode[], id: string): TreeNode | null => {
        for (const node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = findNodeById(node.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    const updateNodeChildren = (nodeId: string, children: TreeNode[]) => {
        const updateNodes = (nodes: TreeNode[]): TreeNode[] => {
            return nodes.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, children };
                }
                if (node.children) {
                    return { ...node, children: updateNodes(node.children) };
                }
                return node;
            });
        };

        setTreeData(updateNodes(treeData));
    };

    const handleNodeSelect = (_event: React.SyntheticEvent | null, nodeId: string) => {
        setSelected(nodeId);
        if (nodeId === 'root') {
            onFolderSelect('');
        } else {
            const node = findNodeById(treeData, nodeId);
            debugger;
            if (node) {
                const path = node.type === 'folder' ? node.path : node.path.split('/').slice(0, -1).join('/');
                onFolderSelect(path);
            }
        }
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;

        setLoading(true);
        try {
            const basePath = selected === 'root' ? '' : findNodeById(treeData, selected)?.path || '';
            const folderPath = basePath ? `${basePath}/${newFolderName}/` : `${newFolderName}/`;

            await s3Service.createFolder(folderPath);
            setCreateDialogOpen(false);
            setNewFolderName('');
            await loadRootFiles();
            onRefresh();
        } catch (error) {
            console.error('Failed to create folder:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteFolder = async () => {
        if (selected === 'root') return;

        setLoading(true);
        try {
            const node = findNodeById(treeData, selected);
            if (node) {
                if (node.type === 'folder') {
                    await s3Service.deleteFolder(node.path);
                } else {
                    await s3Service.deleteObject(node.path);
                }
                setDeleteDialogOpen(false);
                setSelected('root');
                loadRootFiles();
                onRefresh();
            }
        } catch (error) {
            console.error('Failed to delete:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderTree = (nodes: TreeNode[]) => {
        return nodes.map((node) => (
            <TreeItem
                key={node.id}
                itemId={node.id}
                label={
                    <Box className="item-info">
                        <Box className="item-icon">
                            {node.type === 'folder' ? (
                                expanded.includes(node.id) ? (
                                    <FolderOpen fontSize="small" />
                                ) : (
                                    <Folder fontSize="small" />
                                )
                            ) : (
                                <InsertDriveFile fontSize="small" />
                            )}
                        </Box>
                        <Typography className="item-name">{node.name}</Typography>
                        {node.type === 'file' && node.size !== undefined && (
                            <Typography className="item-size">{formatFileSize(node.size)}</Typography>
                        )}
                    </Box>
                }
            >
                {node.children && renderTree(node.children)}
            </TreeItem>
        ));
    };

    return (
        <div className="tree-panel">
            <div className="tree-header">
                <Typography variant="h6" component="h2">
                    Files & Folders
                </Typography>
                <Box className="tree-actions">
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Add />}
                        onClick={() => setCreateDialogOpen(true)}
                    >
                        New Folder
                    </Button>
                    <IconButton
                        size="small"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={selected === 'root'}
                        color="error"
                    >
                        <Delete />
                    </IconButton>
                </Box>
            </div>

            <div className="tree-content">
                <SimpleTreeView onItemSelectionToggle={handleNodeToggle}>
                    <TreeItem
                        itemId="root"
                        label={
                            <Box className="item-info">
                                <Box className="item-icon">
                                    <Folder fontSize="small" />
                                </Box>
                                <Typography className="item-name">Root</Typography>
                            </Box>
                        }
                    >
                        {renderTree(treeData)}
                    </TreeItem>
                </SimpleTreeView>
            </div>

            <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
                <DialogTitle>Create New Folder</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Folder Name"
                        fullWidth
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyUp={(e) => e.key === 'Enter' && handleCreateFolder()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateFolder} variant="contained" disabled={loading}>
                        Create
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>Are you sure you want to delete this item? This action cannot be undone.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleDeleteFolder} variant="contained" color="error" disabled={loading}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};
