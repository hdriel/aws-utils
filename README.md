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

# FULL DEMO PROJECT EXAMPLE:
please see this project code before using: [aws-utils-demo github link!](https://github.com/hdriel/aws-utils-demo)
![Main Screen - Preview](https://cdn.jsdelivr.net/gh/hdriel/aws-utils-demo/readme-assets/demo-bucket-image-preview.webp)


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
please see this project code before using: [aws-utils-demo github link!](https://github.com/hdriel/aws-utils-demo)
![Login Screen - Preview](https://cdn.jsdelivr.net/gh/hdriel/aws-utils-demo/readme-assets/login-screen.webp)


---


## Core Features

### C.R.U.D Bucket Operations

```typescript
// CREATE
await s3.initBucket('private'); // Create private bucket (if not exists)
await s3.initBucket('public-read'); // Create public bucket (if not exists)
// Could provided includeConstraintLocation option, like:  
await s3.initBucket('private', { includeConstraintLocation: true} );

// READ
const exists = await s3.isBucketExists(); // check for existance bucket
const info = await s3.bucketInfo();
// info = {
//   name: 'my-bucket',
//   region: 'us-east-1',
//   exists: true,
//   creationDate: Date,
//   versioning: 'Enabled',
//   encryption: { enabled: true, type: 'AES256' },
//   publicAccessBlock: { ... },
//   policy: { ... }
// }

const buckets = await s3.getBucketList(); // get all bucket list from aws s3 storage
// Could get bucket list with public access info like: 
/*
bucket list option: {
    Name?: string | undefined;
    CreationDate?: Date | undefined;
    BucketRegion?: string | undefined;
    BucketArn?: string | undefined;
    PublicAccessBlockConfiguration: {    
        BlockPublicAcls?: boolean | undefined;
        IgnorePublicAcls?: boolean | undefined;
        BlockPublicPolicy?: boolean | undefined;
        RestrictPublicBuckets?: boolean | undefined;
    }
}
*/
const bucketsWithAccess = await s3.getBucketList({ includePublicAccess: true });

// UPDATE
s3.changeBucket('another-bucket'); // Switch to different bucket 

// DELETE
await s3.destroyBucket(); // delete empty bucket
await s3.destroyBucket(true); // Force delete with all contents and bucket
```

### 📁 C.R.U.D Directory Operations

* auto decodeURIComponent for all directory input params
* handle directory issue (no matter if prefix/postfix slashes)

#### Create Directory
```typescript
// CREATE
await s3.createDirectory('/uploads/images');

// READ
const exists = await s3.directoryExists('/uploads/images'); // check for existance directory
const { directories, files } = await s3.directoryList('/uploads');
console.log('Subdirectories:', directories); // string[] directories like: ['images', 'test']
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

// Get second page with 50 items per page
const { directories, files, totalFetched } = await s3.directoryListPaginated('/uploads', {
    pageSize: 50,
    pageNumber: 1 // pageNumber is zero base (0-page one, 1- page two, ...)
});

// DELETE
await s3.deleteDirectory('/uploads/temp'); // Delete directory and all contents

```


### 📄 C.R.U.D File Operations

```typescript
// CREATE
// > Upload File
import { ACLs } from '@hdriel/aws-utils';

// Upload buffer
await s3.uploadFile('/documents/file.pdf', buffer);

// Upload with public access
await s3.uploadFile('/public/image.jpg', buffer, ACLs.public_read);

// Upload with version tag
await s3.uploadFile('/docs/v2.pdf', buffer, ACLs.private, '2.0.0');

// >  Generate Presigned URL
const url = await s3.fileUrl('/private/document.pdf'); // Expires in 15 minutes (default)
const url = await s3.fileUrl('/private/document.pdf', '1h'); // Custom expiration in string value
const url = await s3.fileUrl('/private/document.pdf', 3600); // Custom expiration in seconds value

// READ
const exists = await s3.fileExists('/documents/file.pdf'); // check for existance file
const info = await s3.fileInfo('/documents/file.pdf');
const files = await s3.fileListInfo('/documents'); // List all files in directory
const pdfFiles = await s3.fileListInfo('/documents', 'report-'); // List files with prefix
// Paginated file listing - Recommanded way!
const { files, totalFetched } = await s3.fileListInfoPaginated('/documents', { 
    fileNamePrefix: 'invoice-',
    pageSize: 100,
    pageNumber: 0
});
const version = await s3.fileVersion('/documents/file.pdf'); // Get file version


// > Get File Content
const buffer = await s3.fileContent('/documents/file.pdf'); // As buffer
const base64 = await s3.fileContent('/image.jpg', 'base64'); // As base64 string
const text = await s3.fileContent('/data.json', 'utf8'); // As UTF-8 string

// > Get File Size
const bytes = await s3.sizeOf('/large-file.zip');
const kb = await s3.sizeOf('/large-file.zip', 'KB');
const mb = await s3.sizeOf('/large-file.zip', 'MB');
const gb = await s3.sizeOf('/large-file.zip', 'GB');

// UPDATE 
// > File Tagging
await s3.taggingFile('/documents/file.pdf', {Key: 'version', Value: '1.0.0'}); // Tag file with version


// DELETE 
await s3.deleteFile('/documents/old-file.pdf');

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
  // endpoint: 'http://localhost:4566', // get from .env file
  // region: 'us-east-1', // get from .env file
  // accessKeyId: 'test', // get from .env file
  // secretAccessKey: 'test', // get from .env file
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

### Custom Logger Integration

```typescript
import { Logger } from 'stack-trace-logger';

const logger = new Logger('S3Service');

const s3 = new S3Util({
    bucket: 'my-bucket',
    reqId: 'request-123', 
    logger,
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


## 📋 Complete Express.js Example
# FULL DEMO PROJECT EXAMPLE:
please see this project code before using: [aws-utils-demo github link!](https://github.com/hdriel/aws-utils-demo)
![Main Screen - Preview](https://cdn.jsdelivr.net/gh/hdriel/aws-utils-demo/readme-assets/demo-bucket-image-preview.webp)


## 📝 TypeScript Support

This package is written in TypeScript and includes full type definitions

## 👤 Author

[Hadriel Benjo](https://github.com/hdriel)

## 🔗 Links

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [LocalStack Documentation](https://docs.localstack.cloud/user-guide/aws/s3/)
- [GitHub Repository](#)

---

Made with ❤️ for developers who want powerful S3 utilities without the complexity.