# Quick Setup Guide

## Getting Started in 5 Minutes

### Prerequisites
- Node.js installed (v16+)
- AWS account with S3 access
- IAM credentials (Access Key ID and Secret Access Key)

### Setup Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Open in Browser**
   - Navigate to `http://localhost:5173`
   - You should see the login screen

### First Time Usage

#### Step 1: Prepare Your AWS Credentials

Before using the app, you need:

1. **Access Key ID** - Get this from AWS IAM Console
2. **Secret Access Key** - Get this from AWS IAM Console
3. **Region** - Example: `us-east-1`, `eu-west-1`, etc.
4. **Bucket Name** - The name of your S3 bucket

#### Step 2: Set Up IAM Permissions

Create an IAM user with the following policy attached:

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
        "arn:aws:s3:::YOUR_BUCKET_NAME",
        "arn:aws:s3:::YOUR_BUCKET_NAME/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListAllMyBuckets",
      "Resource": "*"
    }
  ]
}
```

Replace `YOUR_BUCKET_NAME` with your actual bucket name.

#### Step 3: Configure S3 Bucket CORS (if needed)

If you encounter CORS errors, add this CORS configuration to your S3 bucket:

1. Go to AWS S3 Console
2. Select your bucket
3. Go to "Permissions" tab
4. Scroll to "Cross-origin resource sharing (CORS)"
5. Add this configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173", "http://localhost:4173"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

#### Step 4: Login to the Application

1. Enter your AWS Access Key ID
2. Enter your AWS Secret Access Key
3. Select your AWS Region
4. Enter your S3 Bucket Name
5. Click "Connect to S3"

### Common Issues and Solutions

#### Issue: "Connection Failed"

**Solutions:**
- Verify credentials are correct
- Check that bucket name is correct and exists
- Ensure bucket is in the selected region
- Verify IAM permissions are set up correctly

#### Issue: "Access Denied"

**Solutions:**
- Check IAM policy includes all required permissions
- Verify the bucket name in the policy matches your bucket
- Ensure the IAM user has the policy attached

#### Issue: CORS Error

**Solutions:**
- Add CORS configuration to your S3 bucket (see Step 3 above)
- Include your application's URL in AllowedOrigins
- Clear browser cache and retry

#### Issue: Upload Fails

**Solutions:**
- Check file size doesn't exceed S3 limits
- Verify PutObject permission is granted
- Ensure stable internet connection
- Check bucket has sufficient space

### Testing the Application

Once logged in, try these features:

1. **Create a Folder**
   - Click "New Folder" in the left panel
   - Enter a folder name
   - Click "Create"

2. **Upload a File**
   - Click "Upload File" in the right panel
   - Select a file from your computer
   - Watch the progress bar

3. **Navigate Folders**
   - Click on folders in the tree view to expand them
   - Select a folder to view its contents in the right panel

4. **Download a File**
   - Select a file by clicking on it
   - Click "Download" in the actions section

5. **Generate a Shareable Link**
   - Select a single file
   - Click "Generate Link"
   - Copy the temporary URL (valid for 1 hour)

### Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check TypeScript types

### Security Notes

- Credentials are stored only in memory during your session
- No credentials are saved to disk or browser storage
- Credentials are cleared when you logout
- Pre-signed URLs expire after 1 hour
- Always use IAM users with minimal required permissions

### Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check [CUSTOM_API_INTEGRATION.md](./CUSTOM_API_INTEGRATION.md) if you want to use a custom S3 API package
- Customize the styling in `src/styles/` directory
- Add additional features as needed

### Getting Help

If you encounter issues:

1. Check the browser console for error messages
2. Verify AWS credentials and permissions
3. Review the troubleshooting section in README.md
4. Check S3 bucket settings and CORS configuration

### Production Deployment

To deploy to production:

1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy the `dist/` folder to your hosting service:
   - Vercel
   - Netlify
   - AWS S3 + CloudFront
   - Any static hosting service

3. Update CORS configuration to include your production URL

4. Consider using environment variables for sensitive configuration

---

**Ready to start?** Run `npm run dev` and open `http://localhost:5173` in your browser!
