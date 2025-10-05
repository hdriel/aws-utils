# AWS S3 File Explorer

A modern, feature-rich web application for managing files and folders in AWS S3 buckets. Built with React, TypeScript, Material-UI, and Sass.

## Features

### Authentication
- Secure login with AWS credentials (Access Key ID, Secret Access Key, Region)
- Bucket selection
- Session-based credential storage (no persistence to disk)
- Logout functionality to disconnect and re-enter credentials

### File & Folder Management
- **Tree View Navigation**: Hierarchical display of folders and files with expand/collapse functionality
- **Folder Operations**:
  - Create new folders
  - Delete folders (with confirmation)
  - Navigate folder structure
- **File Operations**:
  - Upload files (general, images, videos) with progress tracking
  - Download single files
  - Download multiple files as ZIP archive
  - Delete files (with confirmation)
  - File preview for videos
  - Generate temporary shareable links (pre-signed URLs)
  - Tag files with version metadata

### User Interface
- Clean, modern design using Material-UI components
- Responsive layout with two-panel design
- Real-time upload progress tracking
- Visual feedback for all operations
- Confirmation dialogs for destructive actions

## Technology Stack

- **Frontend Framework**: React 18 with TypeScript
- **UI Library**: Material-UI (MUI) v7
- **Styling**: Sass (SCSS modules)
- **AWS Integration**: AWS SDK for JavaScript
- **File Operations**: JSZip for multi-file downloads
- **Build Tool**: Vite

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- AWS Account with S3 access
- AWS IAM credentials with appropriate S3 permissions

## Required AWS Permissions

Your AWS IAM user needs the following permissions for the S3 bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:PutObjectTagging",
        "s3:GetObjectTagging"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListAllMyBuckets"
      ],
      "Resource": "*"
    }
  ]
}
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd aws-s3-file-explorer
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

## Usage

### Login

1. Enter your AWS credentials:
   - **Access Key ID**: Your AWS access key
   - **Secret Access Key**: Your AWS secret key
   - **Region**: Select your AWS region from the dropdown
   - **Bucket Name**: Enter the name of your S3 bucket

2. Click "Connect to S3" to authenticate

### Managing Files and Folders

#### Left Panel: Tree View

- **View Structure**: See all folders and files in a hierarchical tree
- **Create Folder**: Click "New Folder" button to create a new folder
- **Delete Item**: Select an item and click the delete icon
- **Navigate**: Click folders to expand/collapse and view contents

#### Right Panel: File Management

**Uploading Files:**
- Click "Upload File" for any file type
- Click "Upload Image" for image files specifically
- Click "Upload Video" for video files specifically
- Monitor upload progress in real-time

**Working with Files:**
1. Select files by clicking on them (checkbox selection supported)
2. Available actions based on selection:
   - **Download**: Download single file or multiple files as ZIP
   - **Delete Selected**: Remove selected files (with confirmation)
   - **Tag Version**: Add version metadata to a single file
   - **Generate Link**: Create a temporary shareable link (expires in 1 hour)

**Video Preview:**
- Select a single video file to see an inline preview player

### Logout

Click the "Logout" button in the top-right corner to disconnect and return to the login screen.

## Project Structure

```
src/
├── components/           # React components
│   ├── LoginScreen.tsx  # Authentication screen
│   ├── MainScreen.tsx   # Main application layout
│   ├── TreePanel.tsx    # Left panel - folder tree
│   └── FilePanel.tsx    # Right panel - file management
├── services/
│   └── s3Service.ts     # AWS S3 API integration
├── types/
│   └── aws.ts           # TypeScript type definitions
├── utils/
│   └── fileUtils.ts     # Utility functions
├── styles/              # SCSS style modules
│   ├── login.scss
│   ├── mainScreen.scss
│   ├── treeView.scss
│   └── filePanel.scss
├── App.tsx              # Root component
├── main.tsx             # Application entry point
└── index.css            # Global styles
```

## Integrating Custom S3 API Package

If you have a custom AWS S3 API package, you can integrate it by modifying the `src/services/s3Service.ts` file:

### Step 1: Import Your Custom Package

```typescript
import YourCustomS3API from 'your-custom-s3-package';
```

### Step 2: Replace AWS SDK Implementation

Update the `S3Service` class methods to use your custom API:

```typescript
class S3Service {
  private s3Client: YourCustomS3API | null = null;

  initialize(credentials: AWSCredentials, bucketName: string) {
    this.s3Client = new YourCustomS3API({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: credentials.region,
      bucket: bucketName
    });
  }

  // Update each method to use your custom API
  async listObjects(prefix: string = ''): Promise<S3File[]> {
    const response = await this.s3Client.list({ prefix });
    // Transform response to match S3File interface
    return transformedFiles;
  }

  // ... implement other methods
}
```

### Step 3: Ensure API Compatibility

Your custom S3 API should support these operations:
- List objects/folders
- Create folders
- Upload files with progress tracking
- Delete objects
- Generate pre-signed URLs
- Tag objects with metadata

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Development

- **Run dev server**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Type check**: `npm run typecheck`

## Security Considerations

- AWS credentials are stored only in memory during the session
- Credentials are cleared on logout
- All S3 operations use secure HTTPS connections
- Pre-signed URLs expire after 1 hour
- No sensitive data is persisted to browser storage

## Browser Compatibility

Tested and supported on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Troubleshooting

### Connection Fails
- Verify AWS credentials are correct
- Check that the bucket name exists and you have access
- Ensure your IAM user has the required S3 permissions
- Verify the selected region matches your bucket's region

### CORS Errors
If you encounter CORS errors, you may need to configure CORS on your S3 bucket:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

### Upload Fails
- Check file size limits for your bucket
- Verify write permissions
- Ensure stable internet connection

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
