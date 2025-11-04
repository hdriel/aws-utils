import type { BytesUnit, ByteUnitStringValue } from '../interfaces';
import bytes from 'bytes';
import ms, { type StringValue } from 'ms';

export const parseRangeHeader = (range: string | undefined, contentLength: number, chunkSize: number) => {
    if (!range || !range.startsWith('bytes=')) return null;
    const rangeParts = range.replace('bytes=', '').split('-');
    const start = parseInt(rangeParts[0], 10);
    let end = parseInt(rangeParts[1], 10);
    end = end || start + chunkSize - 1;

    if (isNaN(start) || start < 0 || start >= contentLength) return null;
    if (isNaN(end) || end < start || end >= contentLength) {
        return [start, contentLength - 1];
    }

    return [start, Math.min(end, end)];
};

export const getNormalizedPath = (directoryPath?: string) => {
    return decodeURIComponent(directoryPath?.trim().replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/') || '');
};

export const getFileSize = (
    maxFileSize?: ByteUnitStringValue | number,
    defaultMaxFileSize?: ByteUnitStringValue
): number | undefined => {
    const fileSizeUnitValue = maxFileSize ?? defaultMaxFileSize ?? '';
    const fileSize = typeof fileSizeUnitValue === 'number' ? fileSizeUnitValue : bytes(fileSizeUnitValue);

    return fileSize ?? undefined;
};

export const getTotalSeconds = (msValue: StringValue) => {
    const value = ms(msValue);
    return value / 1000;
};

export const getUnitBytes = (bytes: number, unit?: BytesUnit) => {
    switch (unit?.toUpperCase()) {
        case 'KB':
            return bytes / 1024;
        case 'MB':
            return bytes / 1024 ** 2;
        case 'GB':
            return bytes / 1024 ** 3;
        case 'TB':
            return bytes / 1024 ** 4;
        case 'PB':
            return bytes / 1024 ** 5;
        case 'B':
        default:
            return bytes;
    }
};

// Helper to check if string contains non-ASCII characters
export function hasNonAscii(str: string): boolean {
    return /[^\x00-\x7F]/.test(str);
}

// Safe encode for S3 metadata (max 2KB per metadata value)
export function encodeS3Metadata(value: string): string {
    if (hasNonAscii(value)) {
        // Base64 encode non-ASCII strings
        return Buffer.from(value, 'utf8').toString('base64');
    }
    // Return ASCII strings as-is
    return value;
}
