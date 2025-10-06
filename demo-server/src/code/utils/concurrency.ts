import pLimit from 'p-limit';

// 3–5 לרוב מספיק. התחל ב-4.
export const s3Limiter = pLimit(4);
