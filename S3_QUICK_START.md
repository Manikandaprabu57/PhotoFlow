# AWS S3 Quick Start - PhotoFlow

Quick reference for setting up and using AWS S3 with PhotoFlow.

## ⚡ 5-Minute Setup

### 1. Get AWS Credentials

```bash
# Visit AWS Console
https://console.aws.amazon.com/

# Create S3 bucket
# Create IAM user with S3 permissions
# Copy Access Key ID and Secret Access Key
```

### 2. Configure Environment

Edit `.env` file:

```env
CLOUD_STORAGE_PROVIDER=s3
AWS_S3_BUCKET=photoflow-events-yourname
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_MAX_CONCURRENT_UPLOADS=10
```

### 3. Test Configuration

```bash
npm run test:s3
```

### 4. Start Application

```bash
npm start
```

## 🎯 Common Commands

```bash
# Test S3 storage
npm run test:s3

# Start server with cloud storage
npm start

# Start in development mode
npm run dev:cloud

# Check upload status
# (Access in browser: http://localhost:5000/api/cloud-storage-status)
```

## 🔧 Quick Troubleshooting

### Problem: "Access Denied"
**Solution**: Check IAM permissions, verify credentials in `.env`

### Problem: "Bucket does not exist"
**Solution**: Create bucket in AWS Console, verify name in `.env`

### Problem: "Slow uploads"
**Solution**: Increase `S3_MAX_CONCURRENT_UPLOADS` or enable Transfer Acceleration

### Problem: "Rate limited"
**Solution**: Decrease `S3_MAX_CONCURRENT_UPLOADS` to 3-5

## 📊 Features Enabled

With S3 storage, you get:

- ✅ **Automatic Retry**: 5 attempts with exponential backoff
- ✅ **Queue Management**: Concurrent upload control
- ✅ **Error Recovery**: Automatic retry on failures
- ✅ **Progress Tracking**: Real-time upload status
- ✅ **Status API**: Check queue status anytime
- ✅ **Signed URLs**: Secure temporary access
- ✅ **Global CDN**: Fast downloads worldwide (with CloudFront)

## 🚀 Performance Tips

1. **Choose Nearest Region**: 
   - US: `us-east-1` or `us-west-2`
   - Europe: `eu-west-1` or `eu-central-1`
   - Asia: `ap-south-1` or `ap-southeast-1`

2. **Optimize Concurrent Uploads**:
   ```env
   S3_MAX_CONCURRENT_UPLOADS=10  # For fast internet
   S3_MAX_CONCURRENT_UPLOADS=5   # For average internet
   S3_MAX_CONCURRENT_UPLOADS=3   # For slow internet
   ```

3. **Enable Transfer Acceleration** (Optional):
   - Enable in S3 bucket settings
   - Add to `.env`: `AWS_S3_USE_ACCELERATE=true`

4. **Use CloudFront CDN** (Optional):
   - Create CloudFront distribution
   - Point to S3 bucket
   - Add to `.env`: `AWS_CLOUDFRONT_DOMAIN=xxx.cloudfront.net`

## 💰 Cost Optimization

1. **Enable Lifecycle Policies**:
   - Delete old events after 90 days
   - Archive to Glacier after 30 days

2. **Monitor Usage**:
   ```bash
   # Check AWS Cost Explorer
   https://console.aws.amazon.com/cost-management/
   ```

3. **Set Budget Alerts**:
   - AWS Budgets: Set alert at $10/month
   - Get email when approaching limit

## 📈 Monitoring

### Check Upload Status

```javascript
// In browser console or via API call
fetch('http://localhost:5000/api/cloud-storage-status')
  .then(r => r.json())
  .then(console.log);
```

### Check Storage Usage

```bash
# Via AWS CLI
aws s3 ls s3://your-bucket --recursive --summarize

# Or check AWS Console S3 Metrics
```

## 🔄 Switch from MEGA to S3

```env
# Before (MEGA)
CLOUD_STORAGE_PROVIDER=mega

# After (S3)
CLOUD_STORAGE_PROVIDER=s3
AWS_S3_BUCKET=your-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

Restart server - that's it!

## 📞 Support Links

- [Full Setup Guide](./AWS_S3_SETUP_GUIDE.md)
- [Storage Comparison](./STORAGE_COMPARISON.md)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [PhotoFlow Documentation](./README.md)

## ✅ Success Indicators

When properly configured, you'll see:

```
☁️  Initializing S3 cloud storage...
✅ Cloud storage ready: S3
✅ S3 Storage initialized: your-bucket (us-east-1)
🚀 PhotoFlow Server Started Successfully!
☁️  Cloud Storage:   S3
```

## 🎉 You're Ready!

Your PhotoFlow application is now using AWS S3 with:
- Enterprise-grade reliability
- Automatic retry and queue management
- Concurrent upload support
- Real-time status tracking

**Start uploading photos and enjoy the power of AWS! 📸☁️**
