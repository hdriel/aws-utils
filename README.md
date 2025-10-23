# S3 Utility Package

A powerful, type-safe wrapper around AWS S3 SDK v3 that simplifies S3 operations with advanced features like streaming, file uploads, directory management, and LocalStack support.

## Features

✨ **Simplified API** - Clean, intuitive methods for common S3 operations  
📁 **Directory Management** - Create, list, and delete directories with ease  
📤 **Advanced File Uploads** - Multer integration with Express.js middleware  
🎬 **Video Streaming** - Built-in support for range requests and video streaming  
📦 **Zip Streaming** - Stream multiple files as a zip archive  
🏷️ **File Tagging & Versioning** - Tag files and manage versions  
🔗 **Presigned URLs** - Generate temporary signed URLs  
🧪 **LocalStack Support** - First-class support for local S3 testing  
⚡ **Connection Pooling** - Optimized HTTP/HTTPS agents for better performance  
📊 **Pagination** - Built-in pagination for large directory listings

## Installation

```bash
  npm install @hdriel/aws-utils
```

## Quick Start

First load this file somewhere on starting server
```typescript 
// aws-utils-config.ts
import env from './dotenv.ts';
import { AWSConfigSharingUtil } from '@hdriel/aws-utils';

AWSConfigSharingUtil.setConfig({
    accessKeyId: env?.AWS_ACCESS_KEY_ID,
    secretAccessKey: env?.AWS_SECRET_ACCESS_KEY,
    region: env?.AWS_REGION,
    endpoint: env?.AWS_ENDPOINT,
});

// console.log('AWSConfigSharingUtil configuration');
// console.table(AWSConfigSharingUtil.getConfig());
```
on your server files: 
```typescript
import './aws-utils-config';
...
```

then write your code... 

for example:

```typescript
import { S3Util, S3LocalstackUtil } from '@hdriel/aws-utils';

// Initialize S3 utility

// for localstack usage
const s3 = new S3LocalstackUtil({ bucket: 'demo' });
const directoryTreeInfo = await s3.directoryListPaginated('/', { pageSize: 100, pageNumber: 0 });
console.log('Directory tree info', JSON.stringify(directoryTreeInfo, null, 2));

// OR

// for production usage
const s3 = new S3Util({ bucket: 'demo' });
const directoryTreeInfo = await s3.directoryListPaginated('/', { pageSize: 100, pageNumber: 0 });
console.log('Directory tree info', JSON.stringify(directoryTreeInfo, null, 2));


// Usage examples
// Initialize bucket (creates if doesn't exist)
await s3.initBucket();

// Upload a file
await s3.uploadFile('/documents/file.pdf', fileBuffer);

// Check if file exists
const exists = await s3.fileExists('/documents/file.pdf');

// Get file content
const content = await s3.fileContent('/documents/file.pdf', 'utf8');
```

## Configuration Options

```typescript
interface S3UtilProps {
  bucket: string;                          // Required: S3 bucket name
  logger?: Logger;                         // Optional: Logger instance
  reqId?: string;                          // Optional: Request ID for logging
  accessKeyId?: string;                    // AWS credentials
  secretAccessKey?: string;                // AWS credentials
  endpoint?: string;                       // Custom endpoint (e.g., LocalStack)
  region?: string;                         // AWS region (default: from config)
  s3ForcePathStyle?: boolean;              // Use path-style URLs (default: true)
  maxUploadFileSizeRestriction?: string;   // Max upload size (default: '10GB')
}
```
----

# FULL DEMO PROJECT EXAMPLE: 
please see this project code before using: [AWS-UTILS-DEMO github linke](https://github.com/hdriel/aws-utils-demo)


---


## Core Features

### 🪣 Bucket Operations

#### Initialize Bucket
```typescript
// Create private bucket
await s3.initBucket('private');

// Create public bucket
await s3.initBucket('public-read');

// With location constraint
await s3.initBucket('private', { 
  includeConstraintLocation: true 
});
```

#### Bucket Information
```typescript
const info = await s3.bucketInfo();
console.log(info);
// {
//   name: 'my-bucket',
//   region: 'us-east-1',
//   exists: true,
//   creationDate: Date,
//   versioning: 'Enabled',
//   encryption: { enabled: true, type: 'AES256' },
//   publicAccessBlock: { ... },
//   policy: { ... }
// }
```

#### Check Bucket Exists
```typescript
const exists = await s3.isBucketExists();
```

#### Delete Bucket
```typescript
// Delete bucket (must be empty)
await s3.destroyBucket();

// Force delete with all contents
await s3.destroyBucket(true);
```

#### List All Buckets
```typescript
const buckets = await s3.getBucketList();

// Include public access configuration
const bucketsWithAccess = await s3.getBucketList({ 
  includePublicAccess: true 
});
```

### 📁 Directory Operations

#### Create Directory
```typescript
await s3.createDirectory('/uploads/images');
```

#### List Directory Contents
```typescript
const { directories, files } = await s3.directoryList('/uploads');

console.log('Subdirectories:', directories);
console.log('Files:', files);
// files: [
//   {
//     Key: '/uploads/image.jpg',
//     Name: 'image.jpg',
//     Size: 12345,
//     LastModified: Date,
//     Location: 'https://...'
//   }
// ]
```

#### Paginated Directory Listing
```typescript
// Get second page with 50 items per page
const result = await s3.directoryListPaginated('/uploads', {
  pageSize: 50,
  pageNumber: 1
});

console.log(result.directories); // Array of directory names
console.log(result.files);       // Array of file objects
console.log(result.totalFetched); // Number of items returned
```

#### Delete Directory
```typescript
// Delete directory and all contents
await s3.deleteDirectory('/uploads/temp');
```

#### Check Directory Exists
```typescript
const exists = await s3.directoryExists('/uploads/images');
```

### 📄 File Operations

#### Upload File
```typescript
import { ACLs } from '@hdriel/aws-utils';

// Upload buffer
await s3.uploadFile('/documents/file.pdf', buffer);

// Upload with public access
await s3.uploadFile('/public/image.jpg', buffer, ACLs.public_read);

// Upload with version tag
await s3.uploadFile('/docs/v2.pdf', buffer, ACLs.private, '2.0.0');
```

#### Check File Exists
```typescript
const exists = await s3.fileExists('/documents/file.pdf');
```

#### Get File Content
```typescript
// As buffer
const buffer = await s3.fileContent('/documents/file.pdf');

// As base64 string
const base64 = await s3.fileContent('/image.jpg', 'base64');

// As UTF-8 string
const text = await s3.fileContent('/data.json', 'utf8');
```

#### File Information
```typescript
const info = await s3.fileInfo('/documents/file.pdf');
console.log(info.ContentLength);
console.log(info.ContentType);
console.log(info.LastModified);
```

#### List Files
```typescript
// List all files in directory
const files = await s3.fileListInfo('/documents');

// List files with prefix
const pdfFiles = await s3.fileListInfo('/documents', 'report-');

// Paginated file listing
const { files, totalFetched } = await s3.fileListInfoPaginated('/documents', {
  fileNamePrefix: 'invoice-',
  pageSize: 100,
  pageNumber: 0
});
```

#### File Size
```typescript
const bytes = await s3.sizeOf('/large-file.zip');
const kb = await s3.sizeOf('/large-file.zip', 'KB');
const mb = await s3.sizeOf('/large-file.zip', 'MB');
const gb = await s3.sizeOf('/large-file.zip', 'GB');
```

#### Delete File
```typescript
await s3.deleteFile('/documents/old-file.pdf');
```

#### Generate Presigned URL
```typescript
// Expires in 15 minutes (default)
const url = await s3.fileUrl('/private/document.pdf');

// Custom expiration
const url = await s3.fileUrl('/private/document.pdf', '1h');
const url = await s3.fileUrl('/private/document.pdf', 3600); // seconds
```

#### File Tagging
```typescript
// Tag file with version
await s3.taggingFile('/documents/file.pdf', '1.0.0');

// Get file version
const version = await s3.fileVersion('/documents/file.pdf');
```

### 🎬 Streaming & Express.js Integration

#### Stream File Download
```typescript
import express from 'express';

const app = express();

// Stream single file
app.get('/download/:file', 
  await s3.getStreamFileCtrl({
    filePath: '/documents/file.pdf',
    filename: 'download.pdf',
    forDownloading: true
  })
);
```

#### Stream Zip Archive
```typescript
// Download multiple files as zip
app.get('/download-all',
  await s3.getStreamZipFileCtr({
    filePath: [
      '/documents/file1.pdf',
      '/documents/file2.pdf',
      '/images/photo.jpg'
    ],
    filename: 'archive.zip',
    compressionLevel: 5 // 0-9, lower = faster
  })
);
```

#### Stream Video with Range Support
```typescript
// Video streaming with range requests
app.get('/video/:id',
  await s3.getStreamVideoFileCtrl({
    fileKey: '/videos/movie.mp4',
    contentType: 'video/mp4',
    bufferMB: 5,
    streamTimeoutMS: 30000,
    allowedWhitelist: ['https://myapp.com']
  })
);
```

#### View Image
```typescript
// Serve image with caching
app.get('/image',
  s3.getImageFileViewCtrl({
    queryField: 'path', // ?path=/images/photo.jpg
    cachingAge: 31536000 // 1 year
  })
);

// With fixed file path
app.get('/logo',
  s3.getImageFileViewCtrl({
    fileKey: '/public/logo.png'
  })
);
```

#### View PDF
```typescript
app.get('/pdf',
  s3.getPdfFileViewCtrl({
    queryField: 'document',
    cachingAge: 86400 // 1 day
  })
);
```

### 📤 File Upload Middleware

#### Single File Upload
```typescript
import express from 'express';

const app = express();

app.post('/upload',
  s3.uploadSingleFile('file', '/uploads', {
    maxFileSize: '5MB',
    fileType: ['image', 'application'],
    fileExt: ['jpg', 'png', 'pdf']
  }),
  (req, res) => {
    console.log(req.s3File);
    // {
    //   key: '/uploads/photo.jpg',
    //   location: 'https://...',
    //   size: 12345,
    //   mimetype: 'image/jpeg',
    //   ...
    // }
    res.json({ file: req.s3File });
  }
);
```

#### Multiple Files Upload
```typescript
app.post('/upload-multiple',
  s3.uploadMultipleFiles('photos', '/uploads/gallery', {
    maxFileSize: '10MB',
    maxFilesCount: 5,
    fileType: ['image']
  }),
  (req, res) => {
    console.log(req.s3Files); // Array of uploaded files
    res.json({ files: req.s3Files });
  }
);
```

#### Upload with Custom Filename
```typescript
app.post('/upload',
  s3.uploadSingleFile('file', '/uploads', {
    filename: async (req, file) => {
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      return `${req.user.id}-${timestamp}${ext}`;
    }
  }),
  (req, res) => {
    res.json({ file: req.s3File });
  }
);
```

#### Upload with Custom Metadata
```typescript
app.post('/upload',
  s3.uploadSingleFile('file', '/uploads', {
    metadata: async (req, file) => ({
      userId: req.user.id,
      uploadDate: new Date().toISOString(),
      originalName: file.originalname
    })
  }),
  (req, res) => {
    res.json({ file: req.s3File });
  }
);
```

#### Upload Any Files (Mixed Fields)
```typescript
app.post('/upload-any',
  s3.uploadAnyFiles('/uploads', 10, {
    maxFileSize: '20MB'
  }),
  (req, res) => {
    console.log(req.s3AllFiles); // All uploaded files
    res.json({ files: req.s3AllFiles });
  }
);
```

### Upload Options

```typescript
interface S3UploadOptions {
  acl?: 'private' | 'public-read' | 'public-read-write';
  maxFileSize?: string | number;        // '5MB', '1GB', or bytes
  maxFilesCount?: number;                // For multiple file uploads
  filename?: string | ((req, file) => string | Promise<string>);
  fileType?: Array<'image' | 'video' | 'audio' | 'application' | 'text'>;
  fileExt?: string[];                    // ['jpg', 'png', 'pdf']
  metadata?: object | ((req, file) => object | Promise<object>);
}
```

## 🧪 LocalStack Support

For local development and testing with LocalStack:

```typescript
import { S3LocalstackUtil } from '@hdriel/aws-utils';

const s3 = new S3LocalstackUtil({
  bucket: 'test-bucket',
  endpoint: 'http://localhost:4566',
  region: 'us-east-1',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  s3ForcePathStyle: true
});

// Use same API as S3Util
await s3.initBucket();
await s3.uploadFile('/test.txt', Buffer.from('Hello LocalStack!'));
```

### LocalStack Docker Setup

```yaml
# docker-compose.yml
services:
  localstack:
  image: localstack/localstack
  ports:
    - "127.0.0.1:4566:4566"            # LocalStack Gateway
    - "127.0.0.1:4510-4559:4510-4559"  # external services port range
  environment:
    # LocalStack configuration: https://docs.localstack.cloud/references/configuration/
    - CLEAR_TMP_FOLDER=0
    - DEBUG=${DEBUG:-1}
    - PERSISTENCE=${PERSISTENCE:-1}
    - LAMBDA_EXECUTOR=${LAMBDA_EXECUTOR:-}
    - LOCALSTACK_API_KEY=${LOCALSTACK_API_KEY:-}  # only required for Pro
    - SERVICES=s3,lambda,sns,sqs,iam
    - DATA_DIR=/tmp/localstack/data
    - START_WEB=1
    - DOCKER_HOST=unix:///var/run/docker.sock
    - DEFAULT_REGION=us-east-1
    - AWS_DEFAULT_REGION=us-east-1
    - AWS_EXECUTION_ENV=True
    - ENV=${NODE_ENV}
    - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-xxxxxxxxx}
    - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-xxxxxxxxxxxxxxxxxxxxx}
    - HOSTNAME_EXTERNAL=localhost
  volumes:
    - "/var/run/docker.sock:/var/run/docker.sock"
    - "${VOLUME_DIR_LOCALSTACK:-./docker-data/aws-localstack}:/var/lib/localstack"
    - "${VOLUME_DIR_LOCALSTACK:-./docker-data/aws-localstack}/aws-s3:/tmp/localstack"
    - "${VOLUME_DIR_LOCALSTACK:-./docker-data/aws-localstack}/aws-bootstrap:/opt/bootstrap/"
  networks:
    - app-network
```

## 🔧 Advanced Usage

### Dynamic Bucket Switching

```typescript
const s3 = new S3Util({
  bucket: 'default-bucket',
  // ... other config
});

// Switch to different bucket
s3.changeBucket('another-bucket');

// Operations now use 'another-bucket'
await s3.fileExists('/file.txt');
```

### Custom Logger Integration

```typescript
import { Logger } from 'stack-trace-logger';

const logger = new Logger('S3Service');

const s3 = new S3Util({
  bucket: 'my-bucket',
  logger,
  reqId: 'request-123'
});

// All operations will log with your logger
await s3.uploadFile('/test.txt', buffer);
```

### Connection Pooling Configuration

The utility includes optimized HTTP/HTTPS agents:

```typescript
// Default configuration (already included):
// - keepAlive: true
// - maxSockets: 300
// - connectionTimeout: 3000ms
// - socketTimeout: 30000ms
```

### Batch Operations

```typescript
// Upload multiple files in parallel
const files = [
  { path: '/docs/file1.pdf', data: buffer1 },
  { path: '/docs/file2.pdf', data: buffer2 },
  { path: '/docs/file3.pdf', data: buffer3 }
];

await Promise.all(
  files.map(file => s3.uploadFile(file.path, file.data))
);

// Delete multiple files
const filesToDelete = ['/old/file1.txt', '/old/file2.txt'];
await Promise.all(
  filesToDelete.map(path => s3.deleteFile(path))
);
```

## 📋 Complete Express.js Example

```typescript
import express from 'express';
import { S3Util, ACLs } from '@hdriel/aws-utils';

const app = express();
const s3 = new S3Util({
  bucket: process.env.S3_BUCKET!,
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Initialize bucket on startup
(async () => {
  await s3.initBucket();
  console.log('S3 bucket initialized');
})();

// Upload endpoint
app.post('/api/upload',
  s3.uploadSingleFile('file', '/uploads', {
    maxFileSize: '10MB',
    fileType: ['image', 'application'],
    filename: async (req, file) => {
      const timestamp = Date.now();
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      return `${timestamp}-${sanitized}`;
    }
  }),
  async (req, res) => {
    const { key, location, size } = req.s3File!;
    
    // Generate temporary URL
    const url = await s3.fileUrl(key, '1h');
    
    res.json({ key, location, size, temporaryUrl: url });
  }
);

// Download endpoint
app.get('/api/download/:key(*)',
  async (req, res, next) => {
    const key = decodeURIComponent(req.params.key);
    const ctrl = await s3.getStreamFileCtrl({ 
      filePath: key,
      forDownloading: true
    });
    ctrl(req, res, next);
  }
);

// List files endpoint
app.get('/api/files', async (req, res) => {
  const { page = '0', size = '50' } = req.query;
  
  const result = await s3.directoryListPaginated('/uploads', {
    pageNumber: parseInt(page as string),
    pageSize: parseInt(size as string)
  });
  
  res.json(result);
});

// Delete file endpoint
app.delete('/api/files/:key(*)', async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  await s3.deleteFile(key);
  res.json({ success: true });
});

// Video streaming endpoint
app.get('/api/video/:id',
  async (req, res, next) => {
    const videoPath = `/videos/${req.params.id}.mp4`;
    const ctrl = await s3.getStreamVideoFileCtrl({
      fileKey: videoPath,
      contentType: 'video/mp4',
      bufferMB: 5
    });
    ctrl(req, res, next);
  }
);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## 🚀 Performance Tips

1. **Use Pagination**: For large directories, always use paginated methods
2. **Stream Large Files**: Use streaming methods instead of loading entire files into memory
3. **Connection Pooling**: The built-in connection pooling is optimized for concurrent requests
4. **Batch Operations**: Use `Promise.all()` for parallel operations when possible
5. **Presigned URLs**: Generate presigned URLs for direct client uploads/downloads when appropriate

## 🛡️ Error Handling

```typescript
try {
  await s3.uploadFile('/docs/file.pdf', buffer);
} catch (error) {
  if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
    console.error('File not found');
  } else {
    console.error('Upload failed:', error);
  }
}
```

## 📝 TypeScript Support

This package is written in TypeScript and includes full type definitions:

```typescript
import type { 
  ContentFile, 
  FileUploadResponse,
  TreeDirectoryItem,
  UploadedS3File,
  S3UploadOptions 
} from '@hdriel/aws-utils';
```

## 👤 Author

[Hadriel Benjo](https://github.com/hdriel)

## 🔗 Links

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [LocalStack Documentation](https://docs.localstack.cloud/user-guide/aws/s3/)
- [GitHub Repository](#)

---

Made with ❤️ for developers who want powerful S3 utilities without the complexity.