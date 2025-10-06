export interface AwsTreeItem {
    name: string;
    path: string;
    type: 'directory' | 'file';
    children: AwsTreeItem[];
}

export interface TreeItem {
    id: string;
    label: string;
    isDirectory: boolean;
    children: TreeItem[] | null;
}
