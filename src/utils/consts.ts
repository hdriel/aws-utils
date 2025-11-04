export enum ACLs {
    private = 'private',
    publicRead = 'public-read',
    publicReadWrite = 'public-read-write',
}

// export const SUPPORTED_IFRAME_EXTENSIONS = [ 'pdf', 'png', 'jpeg', 'js', 'jpg', 'webm', 'json', 'mp3', 'mkv', 'gif', 'txt', 'csv' ];

// prettier-ignore
export const SUPPORTED_IFRAME_EXTENSIONS = [
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'heic', 'heif', 'raw', 'cr2', 'nef', 'arw',
    // Videos
    'mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'mpeg', 'mpg', 'm4v', '3gp', 'ogv', 'ts', 'mts', 'm2ts',
    // Documents
    'pdf',
    // Text
    'txt', 'csv', 'json', 'xml', 'md', 'log', 'yaml', 'yml', 'ini', 'conf', 'cfg',
    // Code
    'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala',
    // Audio
    'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'aiff', 'ape', 'opus',
    // Web
    'html', 'htm', 'css', 'scss', 'sass', 'less'
];
