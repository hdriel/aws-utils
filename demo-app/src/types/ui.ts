export interface AwsTreeItem {
    name: string;
    path: string;
    size: number;
    type: 'directory' | 'file';
    children: AwsTreeItem[];
}

export interface TreeItem {
    id: string;
    label: string;
    isDirectory: boolean;
    children: TreeItem[] | null;
}
