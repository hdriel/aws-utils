import React, { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DialogTitle, Box } from '@mui/material';
import { TreeView, Button, Typography, InputText, Dialog, TreeViewNodeProps, SVGIcon } from 'mui-simple';
import { s3Service } from '../services/s3Service';
import '../styles/treeView.scss';
import { AwsTreeItem } from '../types/ui';
import { getFileIcon } from '../utils/fileUtils.ts';

// const renderTree = (nodes: undefined | TreeNode[]): any => {
//     return (
//         nodes?.map((node) => ({
//             ...node,
//             label: (
//                 <Box className="item-info">
//                     <Box className="item-icon">
//                         {node.type === 'folder' ? (
//                             expanded.includes(node.id) ? (
//                                 <FolderOpen fontSize="small" />
//                             ) : (
//                                 <Folder fontSize="small" />
//                             )
//                         ) : (
//                             <InsertDriveFile fontSize="small" />
//                         )}
//                     </Box>
//                     <Typography className="item-name">{node.label}</Typography>
//                     {node.type === 'file' && node.size !== undefined && (
//                         <Typography className="item-size">{formatFileSize(node.size)}</Typography>
//                     )}
//                 </Box>
//             ) as any,
//             children: renderTree(node.children),
//         })) ?? []
//     );
// };

interface TreePanelProps {
    onFolderSelect: (path: string) => void;
    onRefresh: () => void;
    bucketName: string;
    refreshTrigger: number;
}
interface TreeNodeItem extends TreeViewNodeProps {
    directory: boolean;
    path: string;
    name: string;
    children: TreeNodeItem[];
}

function buildTreeData(root: AwsTreeItem, level = 0, isLast = true, prefix = ''): TreeNodeItem | null {
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
    const connector = level === 0 ? '' : isLast ? '└─ ' : '├─ ';
    const currentPrefix = level === 0 ? '' : prefix + connector;
    const childPrefix = level === 0 ? '' : prefix + (isLast ? '   ' : '│  ');

    return {
        id: uuidv4(),
        path: root.path,
        label: (
            <Box display="flex" alignItems="center" gap={1}>
                <Typography
                    component="span"
                    sx={{
                        fontFamily: 'monospace',
                        color: 'text.secondary',
                        whiteSpace: 'pre',
                        userSelect: 'none',
                    }}
                >
                    {currentPrefix}
                </Typography>
                <SVGIcon muiIconName={getFileIcon(root.name, root.type === 'directory')} />
                <Typography>{root.name}</Typography>
            </Box>
        ) as any,
        name: root.name,
        directory: root.type === 'directory',
        children: root.children
            ?.map((node, index, array) => buildTreeData(node, level + 1, index === array.length - 1, childPrefix))
            .filter((v) => v) as TreeNodeItem[],
    };
}

export const TreePanel: React.FC<TreePanelProps> = ({ onFolderSelect, onRefresh, refreshTrigger }) => {
    const [treeData, setTreeData] = useState<TreeNodeItem | null>(null);
    // const [expanded, setExpanded] = useState<string[]>(['root']);
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
            const root = await s3Service.treeObjects();
            const data = buildTreeData(root);
            if (!data) return;

            setTreeData(data);
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

    // const handleNodeToggle = async (nodeId: string) => {
    //     if (expanded.includes(nodeId)) {
    //         setExpanded(expanded.filter((id) => id !== nodeId));
    //     } else {
    //         setExpanded([...expanded, nodeId]);
    //
    //         const node = findNodeById(treeData, nodeId);
    //         if (node && node.type === 'directory' && (!node.children || node.children.length === 0)) {
    //             try {
    //                 // const files = await s3Service.listObjects(node.path);
    //                 // const children = buildTreeFromFiles(files);
    //                 // updateNodeChildren(nodeId, children);
    //             } catch (error) {
    //                 console.error('Failed to load folder contents:', error);
    //             }
    //         }
    //     }
    // };
    //

    //
    // const updateNodeChildren = (nodeId: string, children: TreeItem[]) => {
    //     const updateNodes = (nodes: TreeItem[]): TreeItem[] => {
    //         return nodes.map((node) => {
    //             if (node.path === nodeId) {
    //                 return { ...node, children };
    //             }
    //             if (node.children) {
    //                 return { ...node, children: updateNodes(node.children) };
    //             }
    //             return node;
    //         });
    //     };
    //
    //     if (treeData) {
    //         const result = updateNodes([treeData]);
    //         setTreeData(result[0]);
    //     }
    // };
    //

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
        if (selected === 'root') return;

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
                loadRootFiles();
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
                    // expanded={expanded}
                    selected={selected}
                    // onExpanded={(nodeIds: string[]) => {
                    //     const newExpanded = nodeIds;
                    //     const addedNode = newExpanded.find((id) => !expanded.includes(id));
                    //     if (addedNode) {
                    //         return handleNodeToggle(addedNode);
                    //     }
                    //     setExpanded(newExpanded);
                    // }}
                    onSelected={(nodeIds: string[]) => setSelected(nodeIds[0])}
                    nodes={treeData ? [treeData] : undefined}
                ></TreeView>
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
