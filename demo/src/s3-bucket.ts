import './config';
import { ACLs, S3BucketUtil } from 'aws-api-utils';

(async () => {
    const s3BucketUtil = new S3BucketUtil({ bucket: 'demo-bucket' });
    const tempDirectory = 'new-directory/nested-directory';
    const filePath = 'testing/files/test.txt';
    const fileData =
        "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.";

    await s3BucketUtil.destroyBucket(true);

    CREATE: {
        console.log('#'.repeat(25));
        console.log('#### CREATE BUCKET\n');

        const bucketsListBefore = await s3BucketUtil.getBucketList();
        console.log('bucket list', bucketsListBefore);

        const bucketName = 'test-bucket';
        console.log('create public bucket', bucketName);
        await s3BucketUtil.initBucket(ACLs.publicRead);

        const bucketsListAfter = await s3BucketUtil.getBucketList();
        console.log('bucket list after creating', bucketsListAfter);

        console.log('\n' + '='.repeat(25));
    }

    EXISTS_BUCKET: {
        console.log('#'.repeat(25));
        console.log('#### EXISTS BUCKET\n');

        const bucketsExists = await s3BucketUtil.isBucketExists();
        console.log('bucket exists', bucketsExists);

        console.log('\n' + '='.repeat(25));
    }

    BUCKET_DIRECTORY: {
        console.log('#'.repeat(25));
        console.log('#### BUCKET DIRECTORY\n');

        const bucketsDirectoryResult = await s3BucketUtil.createDirectory(tempDirectory);
        console.log('bucket directory', bucketsDirectoryResult);

        console.log('\n' + '='.repeat(25));
    }

    UPLOAD: {
        console.log('#'.repeat(25));
        console.log('#### UPLOAD BUCKET file', filePath, '\n');

        const fileUploadData = await s3BucketUtil.uploadFile(filePath, fileData);
        console.log('File Upload Data', fileUploadData);

        console.log('\n' + '='.repeat(25));
    }

    DIRECTORY_LIST_INFO: {
        console.log('#'.repeat(25));
        console.log('#### BUCKET directory and files list', '\n');

        await s3BucketUtil.uploadFile('temp.txt', fileData);
        const directoryTreeInfo = await s3BucketUtil.directoryTree();
        console.log('Directory tree info', directoryTreeInfo);
        await s3BucketUtil.deleteFile('temp.txt');

        const directoryListInfo = await s3BucketUtil.directoryList('testing');
        console.log('Directory List Info', directoryListInfo);

        const directoryPrefixFileListInfo = await s3BucketUtil.fileListInfo('testing/files', 'test');
        console.log('Directory prefix file List Info', directoryPrefixFileListInfo);

        console.log('\n' + '='.repeat(25));
    }

    DELETE_DIRECTORY: {
        console.log('#'.repeat(25));
        console.log('#### DELETE BUCKET DIRECTORY', tempDirectory, '\n');

        const deletedDirectories = await s3BucketUtil.deleteDirectory(tempDirectory);
        console.log('Directory delete response', deletedDirectories);

        console.log('\n' + '='.repeat(25));
    }

    EXISTS: {
        console.log('#'.repeat(25));
        console.log('#### BUCKET FILE EXISTS CHECKING', filePath, '\n');

        const isExistsFile = await s3BucketUtil.fileExists(filePath);
        console.log('File exists', isExistsFile);

        console.log('\n' + '='.repeat(25));
    }

    TAG_FILE: {
        console.log('#'.repeat(25));
        console.log('#### TAG BUCKET file', filePath, '\n');

        const fileTaggingData = await s3BucketUtil.taggingFile(filePath, 'v1.0.1');
        console.log('File tagging Data', fileTaggingData);

        console.log('\n' + '='.repeat(25));
    }

    FILE_VERSION: {
        console.log('#'.repeat(25));
        console.log('#### BUCKET FILE VERSION', filePath, '\n');

        const fileVersionData = await s3BucketUtil.fileVersion(filePath);
        console.log('File version Data', fileVersionData);

        console.log('\n' + '='.repeat(25));
    }

    SIZE_OF_FILE: {
        console.log('#'.repeat(20));
        console.log('#### READ BUCKET size of file', filePath, '\n');

        const fileSize = await s3BucketUtil.sizeOf(filePath, 'bytes');
        console.log('File size', fileSize, fileSize === fileData.length);

        console.log('\n' + '='.repeat(25));
    }

    READ: {
        console.log('#'.repeat(20));
        console.log('#### READ BUCKET file', filePath, '\n');

        const fileInfo = await s3BucketUtil.fileInfo(filePath);
        console.log('File info', fileInfo);

        console.log('\n' + '='.repeat(25));
    }

    FILE_CONTENT: {
        console.log('#'.repeat(20));
        console.log('#### BUCKET FILE CONTENT', filePath, '\n');

        const _fileData = await s3BucketUtil.fileContent(filePath, 'utf8');
        console.log('Correct file data', _fileData === fileData);

        console.log('\n' + '='.repeat(25));
    }

    SIGNED_FILE_URL: {
        console.log('#'.repeat(20));
        console.log('#### BUCKET SIGNED FILE URL', filePath, '\n');

        const fileURL = await s3BucketUtil.fileUrl(filePath);
        console.log('File url', fileURL);

        console.log('\n' + '='.repeat(25));
    }

    DELETE: {
        console.log('#'.repeat(25));
        console.log('#### DELETE BUCKET (with files and force empty bucket first)\n');

        await s3BucketUtil
            .destroyBucket()
            .then((bucketsDeleteResult) => {
                console.log('delete bucket', bucketsDeleteResult);
            })
            .catch((error) => {
                console.log('failed to delete bucket', error.message);
                return s3BucketUtil.deleteFile(filePath);
            })
            .then(async (deleteFileResponse) => {
                console.log('delete bucket file response', deleteFileResponse);
                await s3BucketUtil.uploadFile(`${tempDirectory}/temp000.txt`, fileData);
                return s3BucketUtil.deleteDirectory(tempDirectory.split('/')[0]);
            })
            .then((deleteDirectoryResponse) => {
                console.log('delete bucket directory response', deleteDirectoryResponse);
                return s3BucketUtil.destroyBucket();
            })
            .then((bucketsDeleteResult) => {
                console.log('delete bucket', bucketsDeleteResult);
            })
            .catch((error) => {
                console.error('FAILED TO DELETE BUCKET!!!', error.message);
                return s3BucketUtil.destroyBucket(true);
            });

        console.log('\n' + '='.repeat(25));
    }
})();
