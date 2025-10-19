import type { ByteUnitStringValue } from '../interfaces';
import bytes from 'bytes';

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
