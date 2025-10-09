import React, { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DialogTitle, Box } from '@mui/material';
import { TreeView, Button, Typography, InputText, Dialog, TreeViewNodeProps, SVGIcon } from 'mui-simple';
import { s3Service } from '../services/s3Service';
import '../styles/treeView.scss';
import { AwsTreeItem } from '../types/ui';
import { formatFileSize, getFileIcon } from '../utils/fileUtils.ts';
import { ListObjectsOutput, S3ResponseFile } from '../types/aws.ts';

const CustomNodeItem: React.FC<any> = (props) => {
    const { nodeId, isExpandedId, ...node } = props ?? {};

    const connector = node.level === 0 ? '' : node.isLast ? '└─ ' : '├─ ';
    const currentPrefix = node.level === 0 ? '' : connector;
    // const childPrefix = node.level === 0 ? '' : prefix + (node.isLast ? '   ' : '│  ');

    return (
        <Box className="item-info" key={nodeId}>
            <Typography
                component="span"
                sx={{
                    fontFamily: 'monospace',
                    color: 'text.secondary',
                    whiteSpace: 'pre',
                    userSelect: 'none',
                }}
            >
                {currentPrefix ?? ''}
            </Typography>
            <Box className="item-icon">
                {node.directory ? (
                    <SVGIcon muiIconName={isExpandedId(node.id) ? 'FolderOpen' : 'Folder'} />
                ) : (
                    <SVGIcon muiIconName={getFileIcon(node.directory ? undefined : node.name)} />
                )}
            </Box>
            <Typography className="item-name">{node.label}</Typography>
            {!node.directory && node.size !== undefined && (
                <Typography className="item-size">{formatFileSize(node.size)}</Typography>
            )}
        </Box>
    );
};

interface TreePanelProps {
    onFolderSelect: (path: string) => void;
    onRefresh: () => void;
    bucketName: string;
    refreshTrigger: number;
    localstack: boolean;
}
interface TreeNodeItem extends TreeViewNodeProps {
    directory: boolean;
    prefix?: string;
    path: string;
    name: string;
    size: number;
    level: number;
    children: TreeNodeItem[];
}

function buildTreeData(root: AwsTreeItem, level = 0): TreeNodeItem | null {
    if (!root) return null;

    // Build the tree connector lines
    /*
        📁 root
        ├─ 📁 folder1
        │  ├─ 📄 file1.txt
        │  └─ 📄 file2.txt
        ├─ 📁 folder2
        │  └─ 📄 file3.txt
        └─ 📄 readme.md
     */

    return {
        id: uuidv4(),
        level,
        path: root.path,
        name: root.name,
        label: root.name,
        size: root.size,
        directory: root.type === 'directory',
        children: root.children?.map((node) => buildTreeData(node, level + 1)).filter((v) => v) as TreeNodeItem[],
    };
}

const buildTreeFromFiles = (result: ListObjectsOutput, basePath: string = ''): AwsTreeItem => {
    const { files, directories } = result;
    const children: AwsTreeItem[] = [];

    directories.forEach((path: string) => {
        const name =
            path
                .split('/')
                .filter((p) => p)
                .pop() || path;

        children.push({
            name,
            path,
            size: 0,
            type: 'directory',
            children: [],
        });
    });

    // Add files
    files.forEach((file: S3ResponseFile) => {
        children.push({
            name: file.Name,
            path: file.Key,
            size: file.Size,
            type: 'file',
            children: [],
        });
    });

    return {
        name: basePath || 'root',
        path: basePath || '/',
        type: 'directory',
        size: 0,
        children,
    };
};

export const TreePanel: React.FC<TreePanelProps> = ({ onFolderSelect, onRefresh, refreshTrigger, localstack }) => {
    const [treeData, setTreeData] = useState<TreeNodeItem | null>(null);
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
            if (localstack) {
                const root = await s3Service.treeObjects();
                const data = buildTreeData(root);
                if (!data) return;

                data.id = 'root';
                setTreeData(data);
            } else {
                const result = await s3Service.listObjects();
                const nodeData = buildTreeFromFiles(result);
                const data = buildTreeData(nodeData);
                if (!data) return;

                data.id = 'root';
                setTreeData(data);
            }
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    };

    const findNodeById = (node: TreeNodeItem | null, nodeId: string): TreeNodeItem | null => {
        if (!node) return null;
        const stack = [node];

        while (stack.length) {
            const currNode = stack.shift();
            if (!currNode) break;

            if (currNode.id === nodeId) {
                return currNode;
            }

            if (currNode.children?.length) {
                stack.push(...currNode.children);
            }
        }

        return null;
    };

    const selectedNode = useMemo(() => {
        return selected ? findNodeById(treeData, selected) : null;
    }, [selected]);

    const handleNodeToggle = async (nodeId: string) => {
        if (expanded.includes(nodeId)) {
            setExpanded(expanded.filter((id) => id !== nodeId));
        } else {
            setExpanded([...expanded, nodeId]);

            if (!localstack) {
                const node = findNodeById(treeData, nodeId) as TreeNodeItem;
                if (node && node.directory && (!node.children || node.children.length === 0)) {
                    try {
                        const result = await s3Service.listObjects(node.path);
                        const nodeData = buildTreeFromFiles(result, node.path);
                        const children = nodeData.children.map(
                            (currNode) =>
                                ({
                                    id: uuidv4(),
                                    level: node.level + 1,
                                    path: `${node.path ?? ''}/${currNode.path}`,
                                    name: currNode.name,
                                    label: currNode.name,
                                    size: currNode.size,
                                    directory: currNode.type === 'directory',
                                    children: [],
                                }) as TreeNodeItem
                        );
                        updateNodeChildren(nodeId, children);
                    } catch (error) {
                        console.error('Failed to load folder contents:', error);
                    }
                }
            }
        }
    };

    const updateNodeChildren = (nodeId: string, children: TreeNodeItem[]) => {
        const updateNodes = (nodes: TreeNodeItem[]): TreeNodeItem[] => {
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

        if (treeData) {
            const result = updateNodes([treeData]);
            setTreeData(result[0]);
        }
    };

    useEffect(() => {
        if (selectedNode?.path) {
            const path = selectedNode.directory
                ? selectedNode.path
                : selectedNode.path.split('/').slice(0, -1).join('/');
            onFolderSelect(path);
        } else {
            onFolderSelect('');
        }
    }, [selectedNode]);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;

        setLoading(true);
        try {
            if (!selectedNode) return;

            const basePath = selectedNode?.path === '' ? '' : selectedNode?.path || '';
            const folderPath = [basePath, newFolderName]
                .filter((v) => v)
                .map((p) => p.replace(/\/$/, ''))
                .join('/');

            await s3Service.createFolder(`${folderPath}/`);
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
        if (!selectedNode || selectedNode?.id === 'root') return;

        setLoading(true);
        try {
            if (selectedNode) {
                if (selectedNode.directory) {
                    await s3Service.deleteFolder(selectedNode.path);
                } else {
                    await s3Service.deleteObject(selectedNode.path);
                }
                setDeleteDialogOpen(false);
                setSelected('root');
                await loadRootFiles();
                onRefresh();
            }
        } catch (error) {
            console.error('Failed to delete:', error);
        } finally {
            setLoading(false);
        }
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
                        startIcon="Add"
                        onClick={() => setCreateDialogOpen(true)}
                        label="New Folder"
                    />
                    {selectedNode && (
                        <Button
                            size="small"
                            onClick={() => setDeleteDialogOpen(true)}
                            disabled={!selectedNode?.path}
                            color="error"
                            variant="outlined"
                            sx={{ justifyContent: 'space-between' }}
                            label={selectedNode?.name}
                            startIcon={getFileIcon(selectedNode.name, selectedNode.directory)}
                            endIcon="Delete"
                        />
                    )}
                </Box>
            </div>

            <div className="tree-content">
                <TreeView
                    collapseIcon={'ExpandMore'}
                    expandIcon={'ChevronRight'}
                    expandedIds={expanded}
                    selectedIds={['root']}
                    fieldId="id"
                    onExpanded={(nodeIds: string[]) => setExpanded(nodeIds)}
                    TransitionComponent={null}
                    onSelected={(nodeIds: string[]) => {
                        const [nodeId] = nodeIds;
                        if (nodeId !== selected) {
                            setSelected(nodeId);
                            return handleNodeToggle(nodeId);
                        }
                    }}
                    nodes={treeData ? [treeData] : undefined}
                    externalItemProps={{
                        isExpandedId: (nodeId: string) => expanded.includes(nodeId),
                    }}
                    CustomComponent={CustomNodeItem as any}
                />
            </div>

            <Dialog
                title="Create New Folder"
                open={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
                actions={[
                    { onClick: () => setCreateDialogOpen(false), label: 'Cancel' },
                    { onClick: handleCreateFolder, label: 'Create', variant: 'contained' },
                ]}
            >
                <DialogTitle>Create New Folder</DialogTitle>
                <InputText
                    autoFocus
                    margin="dense"
                    label="Folder Name"
                    fullWidth
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyUp={(e: any) => e.key === 'Enter' && handleCreateFolder()}
                />
            </Dialog>

            <Dialog
                open={deleteDialogOpen}
                title="Confirm Delete"
                onClose={() => setDeleteDialogOpen(false)}
                actions={[
                    { onClick: () => setDeleteDialogOpen(false), label: 'Cancel' },
                    {
                        onClick: handleDeleteFolder,
                        label: 'Delete',
                        variant: 'contained',
                        color: 'error',
                        disabled: loading,
                    },
                ]}
            >
                <DialogTitle>Confirm Delete</DialogTitle>
                <Typography>Are you sure you want to delete this item?</Typography>
                <Typography>This action cannot be undone.</Typography>
            </Dialog>
        </div>
    );
};
