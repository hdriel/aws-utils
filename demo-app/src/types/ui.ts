import { TreeViewNodeProps } from 'mui-simple';

export type FILE_TYPE = 'image' | 'video' | 'application' | 'text' | 'audio';

export interface AwsTreeItem {
    name: string;
    path: string;
    size: number;
    type: 'directory' | 'file';
    index?: number;
    isLast?: boolean;
    children: AwsTreeItem[];
}

export interface TreeNodeItem extends TreeViewNodeProps {
    parentId: null | string;
    directory: boolean;
    prefix?: string;
    path: string;
    name: string;
    size: number;
    level: number;
    index: number;
    isLast: boolean;
    children: TreeNodeItem[];
}
