# AWS S3 Setup Guide for PhotoFlow

This guide will help you configure AWS S3 as your cloud storage provider for PhotoFlow. S3 offers enterprise-grade reliability, scalability, and performance.

## 📋 Prerequisites

- AWS Account (Free tier available: 5GB storage, 20,000 GET requests, 2,000 PUT requests/month)
- Basic understanding of AWS console
- PhotoFlow project setup

## 🚀 Quick Setup (5 Steps)

### Step 1: Create AWS Account

1. Go to [AWS Console](https://aws.amazon.com/)
2. Click "Create an AWS Account"
3. Follow the registration process
4. Verify your email and payment method

### Step 2: Create S3 Bucket

1. **Login to AWS Console**: https://console.aws.amazon.com/
2. **Navigate to S3**: Search for "S3" in the services search bar
3. **Create Bucket**:
   - Click "Create bucket"
   - **Bucket name**: `photoflow-events-[your-unique-id]` (must be globally unique)
     - Example: `photoflow-events-john-2024`
   - **AWS Region**: Choose closest to your users
     - `us-east-1` (N. Virginia) - Default, cheapest
     - `ap-south-1` (Mumbai) - For India
     - `eu-west-1` (Ireland) - For Europe
   - **Block Public Access**: Keep all checkboxes CHECKED (recommended for security)
   - **Versioning**: Disabled (optional)
   - **Encryption**: Enable server-side encryption (recommended)
   - Click "Create bucket"

### Step 3: Create IAM User for PhotoFlow

For security, create a dedicated IAM user instead of using root credentials.

1. **Navigate to IAM**: Search for "IAM" in services
2. **Create User**:
   - Click "Users" → "Create user"
   - **User name**: `photoflow-app`
   - **Access type**: Check "Programmatic access"
   - Click "Next"
   
3. **Set Permissions**:
   - Choose "Attach policies directly"
   - Search and select: `AmazonS3FullAccess` (or create custom policy below)
   - Click "Next" → "Create user"
   
4. **Save Credentials**:
   - **IMPORTANT**: Download the CSV or copy:
     - Access Key ID
     - Secret Access Key
   - You won't be able to see the secret key again!

### Step 4: Configure PhotoFlow

1. **Open `.env` file** in your PhotoFlow project

2. **Update configuration**:
```env
# Cloud Storage Configuration
CLOUD_STORAGE_PROVIDER=s3

# AWS S3 Configuration
AWS_S3_BUCKET=photoflow-events-john-2024
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Optional: Max concurrent uploads (default: 5)
S3_MAX_CONCURRENT_UPLOADS=10
```

3. **Replace values**:
   - `AWS_S3_BUCKET`: Your bucket name from Step 2
   - `AWS_REGION`: Your selected region
   - `AWS_ACCESS_KEY_ID`: From Step 3
   - `AWS_SECRET_ACCESS_KEY`: From Step 3

### Step 5: Test Configuration

1. **Start the server**:
```bash
node app-cloud.js
```

2. **Look for confirmation**:
```
☁️  Initializing S3 cloud storage...
✅ Cloud storage ready: S3
✅ S3 Storage initialized: photoflow-events-john-2024 (us-east-1)
```

3. **Test upload**: Create an event and upload a photo

## 🔒 Security Best Practices

### Create Custom IAM Policy (Recommended)

Instead of `AmazonS3FullAccess`, create a restricted policy:

1. Go to IAM → Policies → Create policy
2. Choose JSON and paste:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:GetObjectMetadata",
                "s3:CopyObject"
            ],
            "Resource": [
                "arn:aws:s3:::photoflow-events-john-2024/*",
                "arn:aws:s3:::photoflow-events-john-2024"
            ]
        }
    ]
}
```

3. Replace `photoflow-events-john-2024` with your bucket name
4. Name the policy: `PhotoFlowS3Access`
5. Attach this policy to your IAM user

### Enable CORS (for direct browser uploads)

If you want to enable direct browser-to-S3 uploads:

1. Go to your S3 bucket
2. Click "Permissions" tab
3. Scroll to "Cross-origin resource sharing (CORS)"
4. Add:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["http://localhost:5000", "https://yourdomain.com"],
        "ExposeHeaders": ["ETag"]
    }
]
```

## 💰 Cost Estimation

### AWS S3 Pricing (as of 2024)

**Storage**: $0.023 per GB/month (first 50 TB)

**Data Transfer**:
- Upload (PUT): Free
- Download (GET): $0.09 per GB (after 100GB free tier)

**Requests**:
- PUT/POST: $0.005 per 1,000 requests
- GET: $0.0004 per 1,000 requests

### Example Costs

**Small Event** (50 guests, 500 photos @ 5MB each):
- Storage: 2.5 GB × $0.023 = $0.06/month
- Uploads: 500 requests × $0.005/1000 = $0.0025
- Downloads: 50 downloads × 2.5GB × $0.09 = $11.25 (one-time)
- **Total first month**: ~$11.31

**Medium Event** (200 guests, 2000 photos @ 5MB each):
- Storage: 10 GB × $0.023 = $0.23/month
- Uploads: 2000 requests × $0.005/1000 = $0.01
- Downloads: 200 downloads × 10GB × $0.09 = $180 (one-time)
- **Total first month**: ~$180.24

**Note**: After initial downloads, storage costs are minimal (~$0.23/month for 10GB)

### Cost Optimization Tips

1. **Enable Lifecycle Policies**:
   - Move old events to cheaper storage classes
   - Delete processed files after X days
   
2. **Use CloudFront CDN**:
   - Reduces data transfer costs
   - Faster downloads for users
   
3. **Compress Files**:
   - Reduce storage and transfer costs
   
4. **Delete Unnecessary Files**:
   - Remove processed selfies after matching
   - Clean up old events regularly

## 🎯 Advanced Configuration

### Enable CloudFront CDN (Optional)

For faster worldwide access:

1. **Create CloudFront Distribution**:
   - Go to CloudFront in AWS Console
   - Click "Create Distribution"
   - Origin domain: Select your S3 bucket
   - Origin access: "Origin access control settings (recommended)"
   - Enable "Use all edge locations"
   
2. **Update PhotoFlow**:
```env
AWS_CLOUDFRONT_DOMAIN=d1234567890.cloudfront.net
```

3. **Configure CORS**: Update S3 bucket CORS to allow CloudFront domain

### Enable S3 Transfer Acceleration (Optional)

For faster uploads from distant locations:

1. Go to your S3 bucket
2. Properties → Transfer acceleration → Enable
3. Update PhotoFlow:
```env
AWS_S3_USE_ACCELERATE=true
```

### Set up S3 Lifecycle Rules

Automatically archive or delete old files:

1. Go to your S3 bucket
2. Management → Lifecycle rules → Create rule
3. Example rule:
   - Name: "Archive old events"
   - Prefix: `events/`
   - Transition to Glacier after 90 days
   - Delete after 365 days

## 🔧 Troubleshooting

### Error: "Access Denied"

**Solution**:
- Verify IAM user has correct permissions
- Check bucket policy doesn't block access
- Ensure credentials in `.env` are correct

### Error: "Bucket does not exist"

**Solution**:
- Verify bucket name is correct (case-sensitive)
- Ensure bucket exists in the specified region
- Check `AWS_REGION` matches bucket region

### Error: "Rate exceeded"

**Solution**:
- AWS has rate limits (3,500 PUT/COPY/POST/DELETE per second)
- Reduce `S3_MAX_CONCURRENT_UPLOADS` in `.env`
- Implement request throttling

### Slow Upload/Download

**Solution**:
- Choose region closer to your location
- Enable S3 Transfer Acceleration
- Use CloudFront CDN for downloads
- Check your internet connection

## 📊 Monitoring & Alerts

### Set up CloudWatch Alarms

1. Go to CloudWatch in AWS Console
2. Create alarms for:
   - Storage size exceeding budget
   - Data transfer costs
   - Error rates
   - Request counts

### Check S3 Metrics

1. Go to your S3 bucket
2. Click "Metrics" tab
3. View:
   - Storage usage
   - Request counts
   - Error rates
   - Data transfer

## 🔄 Migration from Other Storage

### From MEGA to S3

1. **Keep both configurations** in `.env`:
```env
# Current (MEGA)
CLOUD_STORAGE_PROVIDER=mega

# Add S3 config for migration
AWS_S3_BUCKET=photoflow-events-john-2024
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

2. **Run migration script** (if available) or manually upload files

3. **Switch provider**:
```env
CLOUD_STORAGE_PROVIDER=s3
```

4. **Test thoroughly** before removing MEGA config

### From Local to S3

1. **Upload existing events** to S3:
```bash
# Use AWS CLI
aws s3 sync ./events s3://your-bucket/events/
```

2. **Update configuration**:
```env
CLOUD_STORAGE_PROVIDER=s3
```

3. **Keep local backup** until confirmed working

## 📚 Additional Resources

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS S3 Pricing Calculator](https://calculator.aws/)
- [S3 Security Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
- [PhotoFlow Documentation](./README.md)

## 🆘 Support

If you encounter issues:

1. Check server logs for detailed error messages
2. Verify AWS credentials and permissions
3. Test AWS CLI access: `aws s3 ls s3://your-bucket`
4. Review AWS CloudTrail for API call history
5. Contact AWS Support (if needed)

## ✅ Checklist

Before going to production:

- [ ] AWS account created and verified
- [ ] S3 bucket created with appropriate settings
- [ ] IAM user created with restricted permissions
- [ ] Credentials saved securely
- [ ] `.env` file configured correctly
- [ ] Server starts without errors
- [ ] Test upload successful
- [ ] Test download successful
- [ ] CORS configured (if needed)
- [ ] Lifecycle rules set (optional)
- [ ] CloudWatch alarms configured
- [ ] Backup strategy in place
- [ ] Cost monitoring enabled

## 🎉 Success!

Your PhotoFlow application is now using AWS S3 for cloud storage!

Benefits you now have:
- ✅ Enterprise-grade reliability (99.999999999% durability)
- ✅ Unlimited scalability
- ✅ Global availability
- ✅ Built-in redundancy
- ✅ Cost-effective storage
- ✅ Advanced security features
- ✅ Automatic retry and error handling
- ✅ Queue management for uploads
- ✅ Concurrent upload support

**Happy photo matching with AWS S3! 📸☁️**
