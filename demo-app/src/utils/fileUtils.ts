export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function isVideoFile(filename: string): boolean {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm'];
    return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
}

export function isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'];
    return imageExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
}

export async function downloadFile(url: string, filename: string): Promise<void> {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

const treeItemIcon = {
    file: 'InsertDriveFile',
    directory: 'FolderOpenTwoTone',
    video: 'PlayCircle',
    image: 'Image',
};

export const getFileIcon = (filename: string, isDirectory: boolean = false) => {
    if (!filename) return;
    if (isDirectory) return treeItemIcon.directory;
    if (isImageFile(filename)) return treeItemIcon.image;
    if (isVideoFile(filename)) return treeItemIcon.video;
    return treeItemIcon.file;
};
