import { TreeViewNodeProps } from 'mui-simple';

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
