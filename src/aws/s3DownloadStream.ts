import Stream from 'stream';

type S3DownloadStreamOptions = {
    readonly s3: any;
    readonly bucket: string;
    readonly key: string;
    readonly rangeSize?: number;
};

const DEFAULT_DOWNLOAD_CHUNK_SIZE = 512 * 1024;

export class S3StreamDownload extends Stream.Transform {
    private options: S3DownloadStreamOptions;
    private _currentCursorPosition = 0;
    private _maxContentLength = -1;

    constructor(options: S3DownloadStreamOptions, nodeReadableStreamOptions?: Stream.ReadableOptions) {
        super(nodeReadableStreamOptions);
        this.options = options;
        this.init();
    }

    async init() {
        const res = await this.options.s3.headObject({ Bucket: this.options.bucket, Key: this.options.key });
        // @ts-ignore
        this._maxContentLength = res.ContentLength as number;
        await this.fetchAndEmitNextRange();
    }

    async fetchAndEmitNextRange() {
        if (this._currentCursorPosition > this._maxContentLength) {
            this.end();
            return;
        }

        // Calculate the range of bytes we want to grab
        const range = this._currentCursorPosition + (this.options.rangeSize ?? DEFAULT_DOWNLOAD_CHUNK_SIZE);

        // If the range is greater than the total number of bytes in the file
        // We adjust the range to grab the remaining bytes of data
        const adjustedRange = range < this._maxContentLength ? range : this._maxContentLength;

        // Set the Range property on our s3 stream parameters
        const rangeParam = `bytes=${this._currentCursorPosition}-${adjustedRange}`;

        // Update the current range beginning for the next go
        this._currentCursorPosition = adjustedRange + 1;

        // Grab the range of bytes from the file
        this.options.s3.getObject(
            { Bucket: this.options.bucket, Key: this.options.key, Range: rangeParam },
            (error: Error | undefined, res: { Body: any }) => {
                if (error) {
                    // If we encounter an error grabbing the bytes
                    // We destroy the stream, NodeJS ReadableStream will emit the 'error' event
                    this.destroy(error);
                    return;
                }

                console.log(`fetched range ${this.options.bucket}/${this.options.key} | ${rangeParam}`);

                // @ts-ignore
                const data = res.Body;

                if (!(data instanceof Stream.Readable)) {
                    // never encountered this error, but you never know
                    this.destroy(new Error(`unsupported data representation: ${data}`));
                    return;
                }

                data.pipe(this, { end: false });

                let streamClosed = false;

                data.on('end', async () => {
                    if (streamClosed) {
                        return;
                    }
                    streamClosed = true;
                    await this.fetchAndEmitNextRange();
                });
            }
        );
    }

    _transform(chunk: any, _: any, callback: (arg0: null, arg1: any) => void) {
        callback(null, chunk);
    }
}
