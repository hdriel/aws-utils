# `@hdriel/aws-utils` — Usage Reference

> Copy this file into any project that consumes `@hdriel/aws-utils` (e.g. as
> `docs/aws-utils.md`, or paste the relevant parts into that project's
> `CLAUDE.md`). It documents the **actual public API** so an assistant can wire
> the package correctly without reading the library source.

A thin, typed wrapper over AWS SDK **v3** for **S3**, **Lambda**, **SNS** and
**IAM**. Ships ESM + CJS with bundled `.d.ts`.

---

## 1. Install

```bash
pnpm add @hdriel/aws-utils
# or: npm i @hdriel/aws-utils
```

Peer runtime expectations:

- **Node.js ≥ 18** (uses `Buffer`, `fetch`-era streams, `AbortController`).
- The S3 **upload / stream middlewares** return Express-style
  `(req, res, next)` handlers — install `express` (and `@types/express`) in the
  consuming app if you use them. Nothing else in the package needs Express.
- The package is `"type": "module"`. In a CJS project use
  `const { S3Util } = require('@hdriel/aws-utils')` (the CJS build is shipped) or
  dynamic `import()`.

---

## 2. Credentials & region resolution

Every util constructor accepts these optional fields (all default to
`undefined`, in which case the **AWS SDK default chain** is used — env vars,
`~/.aws/credentials`, ECS/EC2/Lambda role):

| field             | type      | notes                                                      |
| ----------------- | --------- | ---------------------------------------------------------- |
| `accessKeyId`     | `string`  | must be paired with `secretAccessKey` or it is ignored    |
| `secretAccessKey` | `string`  | "                                                          |
| `endpoint`        | `string`  | override for LocalStack / custom S3-compatible storage    |
| `region`          | `string`  | falls back to `AWS_REGION` env / SDK default              |
| `logger`          | `Logger`  | a `stack-trace-logger` instance; optional, used for debug |
| `reqId`           | `string`  | correlation id attached to log lines                      |

### Global defaults (optional)

Set once at process startup; any constructor field left `undefined` falls back
to these:

```ts
import { AWSConfigSharingUtil } from '@hdriel/aws-utils';

AWSConfigSharingUtil.setConfig({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT, // omit for real AWS
});

AWSConfigSharingUtil.getConfig(); // { accessKeyId, secretAccessKey, region, endpoint }
```

`setConfig` merges only the keys you pass, so
`AWSConfigSharingUtil.setConfig({ region: 'eu-west-1' })` updates the region and
leaves the other values intact.

---

## 3. S3 — `S3Util`

```ts
import { S3Util, ACLs } from '@hdriel/aws-utils';

const s3 = new S3Util({
  bucket: 'my-bucket',              // required
  region: 'us-east-1',
  // accessKeyId / secretAccessKey / endpoint / logger / reqId  — optional
  // s3ForcePathStyle?: boolean               (default true)
  // maxUploadFileSizeRestriction?: `${number}${'B'|'KB'|'MB'|'GB'|'TB'}`  (default '10GB')
});
```

### Path / key rules (important)

- All `fileKey` / `directoryPath` args are **normalized**: leading & trailing
  `/` stripped, `//` collapsed, `decodeURIComponent` applied. So `'/a/b.txt'`,
  `'a/b.txt'` and `'a//b.txt'` address the same object.
- Passing `''` or `'/'` to a **file** operation throws `Error('No file key provided')`.
- `s3.link` → base URL for the bucket, always ending with `/`
  (`https://s3.<region>.amazonaws.com/<bucket>/`, or the LocalStack URL).

### Bucket ops

```ts
await s3.isBucketExists();                       // boolean
await s3.initBucket(ACLs.private);               // create if missing; returns CreateBucketCommandOutput | undefined
await s3.initBucket(ACLs.publicRead, {           // public bucket: sets PublicAccessBlock=off + s3:GetObject policy
  includeConstraintLocation: true,               // add CreateBucketConfiguration.LocationConstraint = region
  skipInitializedBucket: true,                   // no-op if this instance already initialized this bucket
});
await s3.getBucketList({ includePublicAccess: true }); // Bucket[] (+ PublicAccessBlockConfiguration) | null
await s3.bucketInfo();                           // BucketInfo: exists, region, acl, policy, versioning, encryption, ...
await s3.destroyBucket(true /* empty it first */); // DeleteBucketCommandOutput | undefined
s3.changeBucket('other-bucket');                 // point this instance at a different bucket
```

### File ops

```ts
await s3.fileExists('docs/report.pdf');                     // boolean
await s3.fileInfo('docs/report.pdf');                       // HeadObjectCommandOutput & { Name, Key, Location }
await s3.sizeOf('docs/report.pdf', 'mb');                   // number, unit: 'b'|'kb'|'mb'|'gb'|'tb' (default 'b')
await s3.fileVersion('docs/report.pdf');                    // string — value of the object tag "version" ('' if none)

// read content
const buf  = await s3.fileContent('docs/report.pdf');           // Buffer (default)
const txt  = await s3.fileContent('docs/a.json', 'utf8');       // string
const b64  = await s3.fileContent('docs/a.png', 'base64');      // string

// write content — accepts Buffer | Readable | string | Uint8Array | object
await s3.uploadFileContent('docs/a.json', { hello: 'world' }, {
  acl: ACLs.private,        // default ACLs.private
  version: '2.0.0',         // written as object tag "version=..."; default '1.0.0'
  prettier: true,           // JSON.stringify(obj, null, 2) for object input; default true
});
// → FileUploadResponse: { ETag, Location, Key, Bucket }

// presigned GET url — expiresIn: number(seconds) | ms-string (default '15m')
await s3.fileUrl('docs/report.pdf', '1h');                  // string (signed URL)

// tags
await s3.taggingFile('docs/report.pdf', { Key: 'version', Value: '2.0.0' }); // boolean (false on failure, never throws)
await s3.taggingFile('docs/report.pdf', [{ Key: 'a', Value: '1' }, { Key: 'b', Value: '2' }]);

await s3.deleteFile('docs/report.pdf');                     // DeleteObjectCommandOutput
```

### Listing files

```ts
// non-recursive listing of one "folder"; every item carries a `Location` URL
await s3.fileList('uploads', 'img_');                       // (ContentFile & { Location })[]  — prefix filter optional
await s3.fileListPaginated('uploads', { pageNumber: 0, pageSize: 100, fileNamePrefix: 'img_' });
// → { files: (ContentFile & { Location })[], totalFetched: number }
```

### Directory ops

S3 has no real directories; these emulate them with `/`-suffixed marker objects
and `Delimiter: '/'` listings.

```ts
await s3.directoryExists('uploads/2024');                   // boolean
await s3.createDirectory('uploads/2024');                   // PutObjectCommandOutput (creates "uploads/2024/")
await s3.deleteDirectory('uploads/2024');                   // recursively deletes everything under it; DeleteObjectsCommandOutput | null

await s3.directoryList('uploads');                          // { directories: string[], files: ContentFile[] }
await s3.directoryListPaginated('uploads', { pageNumber: 0, pageSize: 100 });
// → { directories: string[], files: ContentFile[], totalFetched: number }

await s3.directoryTree('uploads');                          // recursive TreeDirectoryItem { name, path, type, children[] }
```

> **Known quirk:** listing the **bucket root** (`''` / `'/'`) behaves
> differently on real AWS vs LocalStack. For LocalStack use `S3LocalstackUtil`
> (below), which overrides `directoryList` for correct root behavior.

### Raw client escape hatch

```ts
s3.client;    // the underlying @aws-sdk/client-s3 S3Client — use for anything not wrapped here
```

---

## 4. S3 Express middlewares (streaming & uploads)

All of these are methods on `S3Util`. Each is called as `method(opts)` and
**returns an Express handler** `(req, res, next) => Promise<void>` — mount it
directly, no `await`. Unless you pass an explicit `fileKey`, the key is read from
`req.params[paramsField]` → `req.query[queryField]` → header `headerField`
(defaults: `paramsField='file'`, `queryField='file'`, `headerField='x-fileKey'`).

| method                              | purpose                                             |
| ----------------------------------- | -------------------------------------------------- |
| `streamFileCtrl(opts)`              | generic download / inline view, any content type   |
| `streamVideoFileCtrl(opts)`         | video with HTTP `Range` support (206 partial)       |
| `streamImageFileCtrl(opts)`         | image bytes with long cache                         |
| `streamBufferFileCtrl(opts)`        | PDF / office docs, inline                           |
| `streamZipFileCtr(opts)` *(no `l`)* | zip several keys on the fly                         |

```ts
import express from 'express';
const app = express();

// Generic download / inline view (auto Content-Type + Content-Disposition)
app.get('/files/:file', s3.streamFileCtrl({
  forDownloading: false,      // false = inline (default), true = attachment
  cachingAge: '1h',          // null | number(seconds) | ms-string
  streamMethod: 'pipe',      // 'pipe' | 'pipeline' (auto-chosen if omitted)
}));

// Video with HTTP Range support (206 partial content)
app.get('/video/:file', s3.streamVideoFileCtrl({
  bufferMB: 5,
  allowedWhitelist: ['https://app.example.com'], // optional CORS allow-list
  streamTimeoutMS: 30_000,
}));

// Image bytes with long cache
app.get('/img/:file', s3.streamImageFileCtrl({ cachingAge: '1y' }));

// PDF / office docs inline
app.get('/doc/:file', s3.streamBufferFileCtrl({ cachingAge: '1h' }));

// Zip multiple keys on the fly (fileKey may be string | string[])
app.get('/download-zip', s3.streamZipFileCtr({
  fileKey: ['a/1.png', 'a/2.png'],
  filename: 'photos.zip',
  compressionLevel: 5,       // 0-9
}));
```

### Uploads (multer + multer-s3)

```ts
import { ACLs } from '@hdriel/aws-utils';

const uploadOpts = {
  acl: ACLs.private,
  maxFileSize: '25MB',                 // `${number}${Unit}` | number(bytes)
  fileType: ['image', 'application'],  // FILE_TYPE | FILE_TYPE[]  — 'image'|'video'|'application'|'text'|'audio'
  fileExt: ['png', 'jpg', 'pdf'],      // FILE_EXT | FILE_EXT[]
  filename: (req, file) => `${Date.now()}-${file.originalname}`, // string | (req,file)=>string|Promise<string>
  metadata: { uploadedBy: 'system' },  // Record<string,string> | (req,file)=>Record<string,string>|Promise<...>
};

// single file  → sets req.s3File
app.post('/upload', s3.uploadSingleFileMW('file', 'uploads/2024', uploadOpts), (req, res) => {
  res.json(req.s3File);              // UploadedS3File: { key, location, bucket, contentType, metadata, size, etag, ... }
});

// many files, same field → sets req.s3Files
app.post('/upload-many', s3.uploadMultipleFilesMW('files', 'uploads', { ...uploadOpts, maxFilesCount: 10 }), (req, res) => {
  res.json(req.s3Files);
});

// any field names → sets req.s3AllFiles
app.post('/upload-any', s3.uploadAnyFilesMW('uploads', 20, uploadOpts), (req, res) => {
  res.json(req.s3AllFiles);
});
```

Notes:

- Non-ASCII `metadata` values and the original filename are **base64-encoded**
  automatically for S3 metadata; an `originalname-encoded: 'base64' | 'plain'`
  flag is added.
- `maxFileSize` in options overrides the instance's
  `maxUploadFileSizeRestriction`.

---

## 5. S3 on LocalStack — `S3LocalstackUtil`

Same API as `S3Util`, but flags itself as LocalStack and fixes root-directory
listing.

```ts
import { S3LocalstackUtil } from '@hdriel/aws-utils';

const s3 = new S3LocalstackUtil({
  bucket: 'my-bucket',
  endpoint: 'http://localhost:4566',
  region: 'us-east-1',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  // s3ForcePathStyle defaults to true — keep it for LocalStack
});
```

---

## 6. Lambda — `LambdaUtil<TPayload, TResult>`

```ts
import { LambdaUtil } from '@hdriel/aws-utils';

// TPayload = request shape, TResult = the ALREADY JSON-parsed response value
const reportLambda = new LambdaUtil<GenerateReportParams, { reportKey: string }>({
  serviceFunctionName: 'serverless-vibe-report-dev-directInvokeGenerateReport', // required
  region: 'us-east-1',
  // accessKeyId / secretAccessKey / endpoint / logger / reqId — optional
});
```

| method                                               | invocation type   | returns                                                          |
| ---------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| `triggerLambdaEvent(payload?)`                       | `Event` (async)   | `Promise<InvokeCommandOutput>` — fire-and-forget, no body       |
| `runLambdaInDryRunMode(payload?)`                    | `DryRun`          | `Promise<InvokeCommandOutput>` — permission/validation check    |
| `runAndGetLambdaResponse<R = TResult>(payload?)`     | `RequestResponse` | `Promise<R>` — payload **decoded from buffer + `JSON.parse`d**  |
| `runAndGetProxyResponse<R = TResult>(payload?)`      | `RequestResponse` | `Promise<R>` — additionally unwraps `{ statusCode, body }`      |

```ts
// fire-and-forget
await reportLambda.triggerLambdaEvent(params).catch(console.error);

// synchronous, typed result — no manual Buffer/JSON handling needed
const { reportKey } = await reportLambda.runAndGetLambdaResponse(params);

// override the result type per call
const raw = await reportLambda.runAndGetLambdaResponse<{ ok: boolean }>(params);
```

`runAndGetLambdaResponse` **throws** when:

- `StatusCode` is not 2xx, or
- the Lambda itself threw (`FunctionError` present in the response) — the error
  message includes the decoded payload.

Use `runAndGetProxyResponse` when the Lambda returns an API-Gateway-style
envelope (`{ statusCode: number, body: string }` where `body` is itself JSON):
it parses `body`, returns it typed as `R`, and throws on a non-2xx `statusCode`
(using `body.error` as the message when present).

```ts
const result = await reportLambda.runAndGetProxyResponse<{ reportKey: string }>(params);
```

Helpers / escape hatch:

```ts
import { decodeLambdaPayload } from '@hdriel/aws-utils';
decodeLambdaPayload(someInvokeOutput.Payload); // Uint8Array | string | undefined  ->  string

reportLambda.client; // underlying @aws-sdk/client-lambda Lambda client
```

---

## 7. SNS — `SnsUtil<T>`

```ts
import { SnsUtil } from '@hdriel/aws-utils';

const topic = new SnsUtil<{ event: string; userId: string }>({
  topicArn: 'arn:aws:sns:us-east-1:123456789012:my-topic', // required
  region: 'us-east-1',
});

// objects are JSON.stringify'd; strings are sent as-is
await topic.publishMessage({ event: 'user.created', userId: 'u_123' }); // PublishCommandOutput

topic.client; // underlying @aws-sdk/client-sns SNS client
```

---

## 8. IAM — `IamUtil`

```ts
import { IamUtil } from '@hdriel/aws-utils';

const iam = new IamUtil({ region: 'us-east-1' });

const users = await iam.listUsers(50); // User[] | undefined  — returns null and logs on error (does NOT throw)

iam.client; // underlying @aws-sdk/client-iam IAMClient
```

---

## 9. Exported constants & types

```ts
import {
  ACLs,                       // enum: ACLs.private | ACLs.publicRead | ACLs.publicReadWrite
  SUPPORTED_IFRAME_EXTENSIONS,// string[] of extensions safe to render inline
  AWSConfigSharingUtil,
} from '@hdriel/aws-utils';

import type {
  BucketInfo,
  FileUploadResponse,         // { ETag, Location, Key, Bucket }
  UploadedS3File,             // Express.Multer.File + { key, location, bucket, contentType, metadata, etag, ... }
  TreeDirectoryItem,
  TreeFileItem,
  FILE_TYPE,                  // 'image' | 'video' | 'application' | 'text' | 'audio'
  FILE_EXT,                   // union of common file extensions
  LambdaRawPayload,           // Uint8Array | string | undefined
  LambdaPayloadResponse,      // alias of LambdaRawPayload (deprecated name)
  LambdaUtilProps, S3UtilProps, SnsUtilProps, IamUtilProps,
} from '@hdriel/aws-utils';
```

`ACLs` string values: `ACLs.private = 'private'`,
`ACLs.publicRead = 'public-read'`, `ACLs.publicReadWrite = 'public-read-write'`.

---

## 10. Behavior gotchas (read before debugging)

- **Never throws:** `S3File.taggingFile` (returns `false`), `IamUtil.listUsers`
  (returns `null`). Everything else propagates AWS SDK errors.
- **404 handling:** `fileExists`, `sizeOf`, `directoryExists`, `isBucketExists`
  treat `NotFound` / HTTP 404 as a normal negative result; other errors throw.
- **`sizeOf` on a missing key returns `0`** (after logging a warning), not an error.
- **`fileUrl` / `fileContent` do not check existence first** — a missing key
  surfaces as an AWS error (or an empty-body error for `fileContent`).
- **Path style:** `s3ForcePathStyle` defaults to `true` (needed for LocalStack
  and most S3-compatible stores). Set `false` for virtual-hosted-style AWS URLs
  if that matters to you.
- **ESM package** — in CJS consumers use `require()` against the shipped CJS
  build or dynamic `import()`.
- **Stream middlewares:** every `stream*Ctrl` / `streamZipFileCtr` method returns
  the Express handler synchronously — `app.get('/x', s3.streamFileCtrl(opts))`, no
  `await`.
- **`streamZipFileCtr`** is spelled without a trailing `l`.
- **`AWSConfigSharingUtil.setConfig` merges** — a partial call updates only the
  keys you pass.
