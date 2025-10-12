import React, { useState, useEffect, useMemo } from 'react';
import { DialogTitle, Box } from '@mui/material';
import {
    TreeView,
    Button,
    Typography,
    InputText,
    Dialog,
    SVGIcon,
    IndentBorderTreeItemIcons,
    IndentBorderTreeItem,
} from 'mui-simple';
import { s3Service } from '../services/s3Service';
import '../styles/treeView.scss';
import { AwsTreeItem, TreeNodeItem } from '../types/ui';
import { formatFileSize, getFileIcon } from '../utils/fileUtils.ts';
import { ListObjectsOutput, S3ResponseFile } from '../types/aws.ts';

interface TreePanelProps {
    onFolderSelect: (path: string) => void;
    onRefresh: () => void;
    bucketName: string;
    refreshTrigger: number;
    localstack: boolean;
}

const buildTreeFromFiles = (result: ListObjectsOutput, basePath: string = ''): AwsTreeItem => {
    const { files, directories } = result;
    const children: AwsTreeItem[] = [];

    directories.forEach((path: string) => {
        const name =
            '/' +
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
        children: !basePath || children.length ? children : [{ id: '.', name: '', path: '' } as any],
    };
};

const TreePanel: React.FC<TreePanelProps> = ({ onFolderSelect, onRefresh, refreshTrigger, localstack }) => {
    const [treeData, setTreeData] = useState<TreeNodeItem | null>(null);
    const [expanded, setExpanded] = useState<string[]>([]);
    // @ts-ignore
    const [selectedIds, setSelectedIds] = useState<string[]>(['root']);
    const [selected, setSelected] = useState<string>();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadRootFiles();
    }, [refreshTrigger]);

    const buildNodeLabel = (
        node: AwsTreeItem,
        nodeId: string,
        nodePath: string,
        parentId: string,
        {
            paddingDeleteAction = '-5px',
        }: {
            paddingDeleteAction?: string;
        } = {}
    ) => {
        const isDirectory = node.type === 'directory';

        const label = (
            <Box className="item-icon" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                {isDirectory ? null : <SVGIcon muiIconName={getFileIcon(isDirectory ? '' : node.name)} size={'18px'} />}
                <Typography className="item-name">{node.name}</Typography>
                <Box sx={{ marginInlineStart: 'auto' }}>
                    {!isDirectory && node.size !== undefined && (
                        <Typography className="item-size">{formatFileSize(node.size)}</Typography>
                    )}
                </Box>

                {node.path && node.path !== '/' && (
                    <Button
                        icon={isDirectory ? 'DeleteForever' : 'Delete'}
                        size="small"
                        tooltipProps={{
                            placement: 'top',
                            title: (
                                <p style={{ width: 'max-content' }}>
                                    Delete {node.type}:<br />
                                    {isDirectory ? nodePath : node.name}
                                </p>
                            ),
                        }}
                        sx={{ ...(!isDirectory && { marginInlineEnd: paddingDeleteAction }) }}
                        onClick={() =>
                            handleDeleteAction({
                                id: nodeId,
                                path: nodePath,
                                directory: isDirectory,
                                name: node.name,
                                parentId,
                            } as TreeNodeItem)
                        }
                    />
                )}
            </Box>
        ) as any;

        return label;
    };

    function buildTreeData(root: AwsTreeItem, parentId: string | null = null, level = 0): TreeNodeItem | null {
        if (!root) return null;

        const nodeId = !root.path || root.path === '/' ? 'root' : root.path || '/';
        const label = buildNodeLabel(root, nodeId, root.path, parentId || 'root', { paddingDeleteAction: '-1px' });

        return {
            id: nodeId,
            parentId,
            level,
            path: root.path,
            name: root.name,
            label,
            size: root.size,
            index: root.index ?? 0,
            isLast: root.isLast ?? false,
            directory: root.type === 'directory',
            sx: {
                '& .MuiTreeItem-content': { paddingY: '0 !important' },
                ...((root.type === 'file' || !root.name) && {
                    '& .MuiTreeItem-label': { marginLeft: '-1px' },
                    '& .MuiTreeItem-iconContainer': { display: 'none' },
                }),
            },
            children: root.children
                ?.map((node) => buildTreeData(node, nodeId, level + 1))
                .filter((v) => v) as TreeNodeItem[],
        };
    }

    const loadRootFiles = async () => {
        try {
            if (localstack) {
                const root = await s3Service.treeObjects();
                const data = buildTreeData(root);
                if (!data) return;

                setTreeData(data);
            } else {
                const result = await s3Service.listObjects();
                const nodeData = buildTreeFromFiles(result);
                const data = buildTreeData(nodeData);
                if (!data) return;

                setTreeData(data);
                setSelected(data.id);
                setExpanded([data.id]);
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

    const loadNodeFiles = async (nodeId: string) => {
        const node = findNodeById(treeData, nodeId) as TreeNodeItem;
        if (node && node.directory && (!node.children || node.children.length === 0)) {
            try {
                const result = await s3Service.listObjects(node.path);
                console.log('node.path', node.path);
                const nodeData = buildTreeFromFiles(result, node.path);
                const children = nodeData.children.map((currNode, index, arr) => {
                    const currNodePath =
                        currNode.type === 'file' ? currNode.path : `${node.path ?? ''}/${currNode.path}`;
                    const currNodeId = currNodePath;
                    const label = buildNodeLabel(currNode, nodeId, currNodePath, node.id);

                    return {
                        id: currNodeId,
                        parentId: node.id,
                        level: node.level + 1,
                        path: currNodePath,
                        name: currNode.name,
                        label,
                        size: currNode.size,
                        directory: currNode.type === 'directory',
                        children: [],
                        sx: {
                            ...((currNode.type === 'file' || !currNode.name) && {
                                '& .MuiTreeItem-label': { marginLeft: '-5px' },
                                '& .MuiTreeItem-iconContainer': { display: 'none' },
                            }),
                        },
                        index,
                        isLast: index === arr.length - 1,
                    } as TreeNodeItem;
                });

                updateNodeChildren(nodeId, children);
            } catch (error) {
                console.error('Failed to load folder contents:', error);
            }
        }
    };

    const handleNodeToggle = async (nodeId: string) => {
        if (expanded.includes(nodeId)) {
            setExpanded(expanded.filter((id) => id !== nodeId));
        } else {
            setExpanded([...expanded, nodeId]);

            if (!localstack) {
                return loadNodeFiles(nodeId);
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

    const handleDeleteAction = async (node?: TreeNodeItem | null | undefined) => {
        const nodeAction = node || selectedNode;
        if (!nodeAction || nodeAction?.id === 'root') return;

        setLoading(true);
        try {
            if (nodeAction) {
                if (nodeAction.directory) {
                    await s3Service.deleteFolder(nodeAction.path);
                } else {
                    await s3Service.deleteObject(nodeAction.path);
                }
                setDeleteDialogOpen(false);

                if (!localstack) {
                    await handleNodeToggle(nodeAction.id);
                } else {
                    await loadRootFiles();
                }

                setExpanded(['root']);
                setSelected('root');

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
                <Box sx={{ minWidth: 'max-content' }}>
                    <Typography variant="h6" component="h2">
                        Files & Folders
                    </Typography>
                </Box>

                <Box className="tree-actions">
                    <Button
                        variant="outlined"
                        size="small"
                        icon="AddCircleOutlined"
                        tooltipProps={{ title: 'New Folder' }}
                        onClick={() => setCreateDialogOpen(true)}
                    />

                    <Button
                        variant="outlined"
                        size="small"
                        icon="Refresh"
                        tooltipProps={{ title: 'refresh tree' }}
                        onClick={() => {
                            setSelected('');
                            setTimeout(() => {
                                loadRootFiles();
                            }, 500);
                        }}
                    />
                </Box>
            </div>

            <div className="tree-content">
                <TreeView
                    expandedIds={expanded}
                    // selectedIds={selectedIds}
                    selectedIds={['root']}
                    fieldId="id"
                    onExpanded={(nodeIds: string[]) => setExpanded(nodeIds)}
                    TransitionComponent={null}
                    onSelected={(nodeIds: string[]) => {
                        setSelectedIds((state) => (state.join(',') !== nodeIds.join(',') ? nodeIds : state));
                        const [nodeId] = nodeIds;
                        if (nodeId !== selected || nodeId !== 'root') {
                            setSelected(nodeId);
                            return handleNodeToggle(nodeId);
                        }
                    }}
                    nodes={treeData ? [treeData] : undefined}
                    TreeItemComponent={IndentBorderTreeItem as any}
                    {...IndentBorderTreeItemIcons}
                    collapseIcon="FolderOpen"
                    expandIcon="Folder"
                    endIcon="Folder"
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
                        onClick: handleDeleteAction,
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

TreePanel.whyDidYouRender = true;

export default TreePanel;
