# Custom S3 API Integration Guide

This document provides detailed instructions for integrating your custom AWS S3 package with the S3 File Explorer application.

## Overview

The application currently uses the standard AWS SDK for JavaScript (`aws-sdk`). To integrate your custom S3 API package, you'll need to modify the `src/services/s3Service.ts` file to use your package's methods and interfaces.

## Required API Methods

Your custom S3 API package must provide the following functionality:

### 1. Initialization

```typescript
interface InitConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

// Your API should have a way to initialize with credentials
initialize(config: InitConfig): void
```

### 2. Test Connection

```typescript
// Verify that credentials are valid and bucket is accessible
testConnection(): Promise<boolean>
```

### 3. List Objects

```typescript
interface ListOptions {
  prefix?: string;      // Folder path prefix
  delimiter?: string;   // Typically '/' for folder structure
}

// Return list of files and folders
listObjects(options: ListOptions): Promise<Array<{
  key: string;          // Full path including filename
  size: number;         // File size in bytes
  lastModified: Date;   // Last modification date
  type: 'file' | 'folder';
}>>
```

### 4. Create Folder

```typescript
// Create a new folder (typically by creating an object with '/' suffix)
createFolder(path: string): Promise<void>
```

### 5. Upload File

```typescript
interface UploadOptions {
  file: File;           // Browser File object
  key: string;          // Destination path in S3
  contentType?: string; // MIME type
  onProgress?: (percent: number) => void; // Progress callback
}

uploadFile(options: UploadOptions): Promise<void>
```

### 6. Delete Object

```typescript
// Delete a single file or empty folder
deleteObject(key: string): Promise<void>
```

### 7. Delete Folder Recursively

```typescript
// Delete folder and all its contents
deleteFolder(prefix: string): Promise<void>
```

### 8. Generate Pre-signed URL

```typescript
interface SignedUrlOptions {
  key: string;          // Object key
  expiresIn?: number;   // Expiration in seconds (default: 3600)
}

// Generate temporary download URL
getSignedUrl(options: SignedUrlOptions): Promise<string>
```

### 9. Get Object

```typescript
// Retrieve object data (for downloading)
getObject(key: string): Promise<{
  Body: Uint8Array | Buffer;
  ContentType?: string;
}>
```

### 10. Tag Object

```typescript
// Add metadata tags to an object
tagObject(key: string, tags: Record<string, string>): Promise<void>
```

## Integration Steps

### Step 1: Install Your Custom Package

```bash
npm install your-custom-s3-package
```

### Step 2: Update Type Definitions

Create or update `src/types/customS3.ts`:

```typescript
// Define interfaces that match your API's structure
export interface CustomS3Client {
  initialize(config: any): void;
  testConnection(): Promise<boolean>;
  listObjects(options: any): Promise<any[]>;
  // ... other methods
}
```

### Step 3: Modify s3Service.ts

Replace the AWS SDK implementation in `src/services/s3Service.ts`:

```typescript
// OLD (AWS SDK)
import AWS from 'aws-sdk';

// NEW (Your Custom Package)
import { YourCustomS3Client } from 'your-custom-s3-package';
import type { CustomS3Client } from '../types/customS3';

class S3Service {
  private client: CustomS3Client | null = null;
  private bucketName: string = '';

  initialize(credentials: AWSCredentials, bucketName: string) {
    // Initialize your custom client
    this.client = new YourCustomS3Client({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: credentials.region,
    });

    this.bucketName = bucketName;
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      // Use your API's method to test connection
      return await this.client.testConnection();
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  async listObjects(prefix: string = ''): Promise<S3File[]> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      // Call your API's list method
      const response = await this.client.listObjects({
        bucket: this.bucketName,
        prefix: prefix,
        delimiter: '/',
      });

      // Transform response to match S3File interface
      return response.map(item => ({
        key: item.path || item.key,
        name: this.extractFileName(item.path || item.key),
        size: item.size || 0,
        lastModified: new Date(item.lastModified),
        type: item.isFolder ? 'folder' : 'file',
      }));
    } catch (error) {
      console.error('Failed to list objects:', error);
      throw error;
    }
  }

  async uploadFile(
    file: File,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      // Use your API's upload method
      await this.client.uploadFile({
        bucket: this.bucketName,
        file: file,
        key: path,
        contentType: file.type,
        onProgress: (loaded, total) => {
          if (onProgress) {
            const percentage = (loaded / total) * 100;
            onProgress(percentage);
          }
        },
      });
    } catch (error) {
      console.error('Failed to upload file:', error);
      throw error;
    }
  }

  // Implement other methods similarly...
}

export const s3Service = new S3Service();
```

### Step 4: Handle API Differences

Your custom API might have different response formats or method signatures. Here's how to handle common differences:

#### Different Response Structure

```typescript
// If your API returns data in a different format
async listObjects(prefix: string = ''): Promise<S3File[]> {
  const response = await this.client.list(prefix);

  // Transform to expected format
  const files: S3File[] = [];

  // Handle folders
  if (response.folders) {
    response.folders.forEach(folder => {
      files.push({
        key: folder.path,
        name: folder.name,
        size: 0,
        lastModified: new Date(),
        type: 'folder',
      });
    });
  }

  // Handle files
  if (response.files) {
    response.files.forEach(file => {
      files.push({
        key: file.path,
        name: file.name,
        size: file.sizeBytes,
        lastModified: new Date(file.modified),
        type: 'file',
      });
    });
  }

  return files;
}
```

#### Different Progress Callback Format

```typescript
async uploadFile(
  file: File,
  path: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  // If your API uses different progress format
  await this.client.upload(file, path, {
    onUploadProgress: (event) => {
      // Transform to percentage
      if (onProgress && event.total) {
        const percentage = (event.loaded / event.total) * 100;
        onProgress(percentage);
      }
    },
  });
}
```

#### Async vs Sync Methods

```typescript
// If your API uses callbacks instead of promises
async deleteObject(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    this.client.deleteObject(key, (error, result) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
```

## Testing Your Integration

After integrating your custom API, test each feature:

1. **Connection**: Log in with valid credentials
2. **List**: View folders and files in tree view
3. **Create**: Create a new folder
4. **Upload**: Upload a file with progress tracking
5. **Download**: Download a single file
6. **Multi-download**: Select multiple files and download as ZIP
7. **Delete**: Delete a file or folder
8. **Preview**: Select a video file to preview
9. **Tag**: Add a version tag to a file
10. **Link**: Generate a temporary shareable link

## Example Custom API Wrapper

Here's a complete example wrapper for a hypothetical custom S3 API:

```typescript
import { CustomS3SDK } from 'custom-s3-sdk';
import { AWSCredentials, S3File } from '../types/aws';

class CustomS3Service {
  private sdk: CustomS3SDK | null = null;
  private bucket: string = '';

  initialize(credentials: AWSCredentials, bucketName: string) {
    this.sdk = new CustomS3SDK();
    this.sdk.configure({
      auth: {
        accessKey: credentials.accessKeyId,
        secretKey: credentials.secretAccessKey,
      },
      region: credentials.region,
    });
    this.bucket = bucketName;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.sdk.buckets.exists(this.bucket);
      return true;
    } catch {
      return false;
    }
  }

  async listObjects(prefix: string = ''): Promise<S3File[]> {
    const result = await this.sdk.objects.list(this.bucket, { prefix });

    return result.items.map(item => ({
      key: item.fullPath,
      name: item.fileName,
      size: item.bytes,
      lastModified: new Date(item.updatedAt),
      type: item.isDirectory ? 'folder' : 'file',
    }));
  }

  async uploadFile(
    file: File,
    path: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    await this.sdk.objects.upload(this.bucket, path, file, {
      progressCallback: (p) => onProgress?.(p.percentage),
    });
  }

  async deleteObject(key: string): Promise<void> {
    await this.sdk.objects.delete(this.bucket, key);
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return this.sdk.objects.getTemporaryUrl(this.bucket, key, expiresIn);
  }

  // ... implement other methods
}

export const s3Service = new CustomS3Service();
```

## Troubleshooting

### Error: Method not found
- Verify your custom API package exports the expected methods
- Check the method names match your API's documentation

### Type Errors
- Ensure your type definitions match the actual API responses
- Use TypeScript's `as` keyword for type assertions if needed

### Progress Not Working
- Verify your API supports progress callbacks
- Check if the callback format matches expectations

### CORS Issues
- Ensure your custom API handles CORS properly
- Configure CORS settings on your S3 bucket

## Support

If you encounter issues integrating your custom S3 API:

1. Check your API's documentation for correct method signatures
2. Enable console logging to inspect responses
3. Verify all required methods are implemented
4. Test API methods independently before integration

## Additional Resources

- AWS S3 API Reference: https://docs.aws.amazon.com/AmazonS3/latest/API/
- TypeScript Documentation: https://www.typescriptlang.org/docs/
- File API: https://developer.mozilla.org/en-US/docs/Web/API/File
