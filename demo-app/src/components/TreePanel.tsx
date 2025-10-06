import React, { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DialogTitle, DialogContent, DialogActions, Box } from '@mui/material';
import { TreeView, Button, Typography, InputText, Dialog, TreeViewNodeProps, SVGIcon } from 'mui-simple';
import { s3Service } from '../services/s3Service';
import '../styles/treeView.scss';
import { AwsTreeItem } from '../types/ui';

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

const treeItemIcon = {
    file: 'InsertDriveFile',
    directory: 'FolderOpenTwoTone',
    video: 'PlayCircle',
    image: 'Image',
};

const getItemIcon = (node: AwsTreeItem | null) => {
    if (!node) return;

    if (node.type === 'directory') return treeItemIcon.directory;

    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'png':
            return treeItemIcon.image;
        case 'mp4':
            return treeItemIcon.video;
        default:
            return treeItemIcon.file;
    }
};

function buildTreeData(root: AwsTreeItem, level = 0): TreeNodeItem | null {
    const space = `_`.repeat(level + (root.type === 'directory' ? 0 : 1));
    return root
        ? {
              id: uuidv4(),
              path: root.path,
              label: (
                  <Box display="flex" gap={1}>
                      {space}
                      <SVGIcon muiIconName={getItemIcon(root)} />
                      <Typography>{root.name}</Typography>
                  </Box>
              ) as any,
              name: root.name,
              directory: root.type === 'directory',
              children:
                  root.children?.map((node) => buildTreeData(node, level + 1) as TreeNodeItem).filter((v) => v) ?? [],
          }
        : null;
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
            stack.push(...currNode.children);
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
                            startIcon={getItemIcon({
                                type: selectedNode.directory ? 'directory' : 'file',
                                name: selectedNode.name,
                                path: selectedNode.path,
                                children: [],
                            } as AwsTreeItem)}
                            endIcon="Delete"
                        />
                    )}
                </Box>
            </div>

            <div className="tree-content">
                <TreeView
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
                actions={[
                    <Button onClick={() => setCreateDialogOpen(false)} label="Cancel" />,
                    <Button onClick={handleCreateFolder} variant="contained" disabled={loading} label="Create" />,
                ]}
                open={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
            >
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
