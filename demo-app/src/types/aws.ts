export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface S3File {
  key: string;
  name: string;
  size: number;
  lastModified: Date;
  type: 'file' | 'folder';
}

export interface TreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  children?: TreeNode[];
  path: string;
}
