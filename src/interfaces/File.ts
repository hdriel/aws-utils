import { type Unit as BytesUnit } from 'bytes';

export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    destination: string;
    filename: string;
    path: string;
    size: number;
}

export interface FILES3_METADATA extends File {
    directory: string;
}

// prettier-ignore
export type FILE_EXT =
    // Images
    | 'jpg' | 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | 'svg' | 'ico' | 'tif' | 'tiff' | 'heic' | 'heif' | 'raw' | 'cr2' | 'nef' | 'arw'
    // Videos
    | 'mp4' | 'avi' | 'mov' | 'wmv' | 'flv' | 'mkv' | 'webm' | 'mpeg' | 'mpg' | 'm4v' | '3gp' | 'ogv' | 'ts' | 'mts' | 'm2ts'
    // Documents
    | 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'ppt' | 'pptx' | 'odt' | 'ods' | 'odp' | 'rtf' | 'pages' | 'numbers' | 'key'
    // Text
    | 'txt' | 'csv' | 'json' | 'xml' | 'md' | 'log' | 'yaml' | 'yml' | 'ini' | 'conf' | 'cfg'
    // Archives
    | 'zip' | 'rar' | '7z' | 'tar' | 'gz' | 'bz2' | 'xz' | 'iso'
    // Audio
    | 'mp3' | 'wav' | 'ogg' | 'flac' | 'aac' | 'm4a' | 'wma' | 'aiff' | 'ape' | 'opus'
    // Code
    | 'js' | 'ts' | 'jsx' | 'tsx' | 'py' | 'java' | 'c' | 'cpp' | 'h' | 'cs' | 'php' | 'rb' | 'go' | 'rs' | 'swift' | 'kt' | 'scala'
    // Web
    | 'html' | 'htm' | 'css' | 'scss' | 'sass' | 'less'
    // Fonts
    | 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot'
    // 3D/CAD
    | 'obj' | 'fbx' | 'stl' | 'dae' | 'blend' | '3ds' | 'gltf' | 'glb'
    // Executable/Binary
    | 'exe' | 'dll' | 'so' | 'dylib' | 'bin' | 'dmg' | 'pkg' | 'deb' | 'rpm' | 'apk';

export type FILE_TYPE = 'image' | 'video' | 'application' | 'text' | 'audio';

export type ByteUnitStringValue = `${number}${BytesUnit}`;
