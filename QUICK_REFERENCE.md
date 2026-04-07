# PhotoFlow Cloud Storage - Quick Reference Card

## 🚀 Quick Commands

```bash
# Installation
npm install                          # Install all dependencies

# Testing
npm run test:cloud                   # Test cloud storage setup

# Starting Server
npm run start:cloud                  # Start with cloud storage
npm start                            # Start with local storage
npm run dev:cloud                    # Development mode with auto-reload

# Migration
npm run migrate                      # Migrate all events to cloud
npm run migrate:dry-run              # Preview migration
node migrate-to-cloud.js EventName   # Migrate specific event
```

## ⚙️ Configuration Cheat Sheet

### AWS S3
```env
CLOUD_STORAGE_PROVIDER=s3
AWS_S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### MEGA
```env
CLOUD_STORAGE_PROVIDER=mega
MEGA_EMAIL=your-email@example.com
MEGA_PASSWORD=your-password
```

### Google Cloud Storage
```env
CLOUD_STORAGE_PROVIDER=gcs
GCS_BUCKET=your-bucket-name
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILENAME=./gcs-key.json
```

### Local Storage
```env
CLOUD_STORAGE_PROVIDER=local
```

## 📁 File Structure

```
photoAi1/
├── storage/                    # Cloud storage module
│   ├── CloudStorageAdapter.js  # Base class
│   ├── S3StorageAdapter.js     # AWS S3
│   ├── MegaStorageAdapter.js   # MEGA
│   ├── GCSStorageAdapter.js    # Google Cloud
│   ├── StorageFactory.js       # Factory
│   ├── CloudStorageMulter.js   # Multer integration
│   └── index.js                # Exports
├── app.js                      # Original (local storage)
├── app-cloud.js                # Cloud-enabled version
├── migrate-to-cloud.js         # Migration tool
├── test-cloud-storage.js       # Test suite
└── .env                        # Configuration
```

## 🔗 API Endpoints

### Cloud Status
```http
GET /api/cloud-storage-status
```

### Upload Photos
```http
POST /api/upload-event-photos/:eventName
Content-Type: multipart/form-data
Body: photos (files)
```

### Upload Selfie
```http
POST /api/upload-selfie/:eventName
Content-Type: multipart/form-data
Body: selfies (files), email (string)
```

### Get Photos
```http
GET /api/event-photos/:eventName
GET /api/guest-photos/:eventName/:guestEmail
```

### Download
```http
GET /download/:eventName/:email
```

## 🧪 Testing Checklist

- [ ] Environment variables configured
- [ ] `npm run test:cloud` passes
- [ ] Server starts without errors
- [ ] Can upload photos
- [ ] Photos appear in cloud provider
- [ ] Face recognition works
- [ ] Can download photos
- [ ] Emails send correctly

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Tests fail | Check `.env` credentials |
| Upload fails | Verify cloud permissions |
| Server won't start | Check MongoDB connection |
| Photos not syncing | Check network/firewall |
| Email not sending | Use Gmail App Password |
| Python error | Install requirements.txt |

## 📊 Provider Comparison

| Feature | AWS S3 | MEGA | GCS | Local |
|---------|--------|------|-----|-------|
| Setup | Medium | Easy | Medium | None |
| Cost | $$ | Free* | $$ | Free |
| Speed | Fast | Medium | Fast | Fastest |
| Storage | Unlimited | 50GB* | Unlimited | Limited |
| Reliability | 99.99% | 99.9% | 99.99% | 100%** |

*Free tier, **When server running

## 🔐 Security Checklist

- [ ] Credentials in `.env` (not in code)
- [ ] `.env` in `.gitignore`
- [ ] Using App Password for Gmail
- [ ] IAM user has minimum permissions (AWS)
- [ ] Service account properly configured (GCS)
- [ ] 2FA enabled on cloud accounts
- [ ] Regular credential rotation
- [ ] HTTPS enabled in production

## 📈 Performance Tips

1. **Choose nearby region** - Reduce latency
2. **Use CDN** - Faster global delivery
3. **Compress images** - Reduce bandwidth
4. **Batch operations** - Fewer API calls
5. **Cache frequently accessed** - Reduce costs

## 💰 Cost Optimization

### AWS S3
- Use S3 Intelligent-Tiering
- Enable lifecycle policies
- Use CloudFront for downloads
- Monitor with Cost Explorer

### MEGA
- Stay within free tier (50GB)
- Upgrade only when needed
- Use Pro plans for large events

### GCS
- Use Nearline for archives
- Enable lifecycle management
- Use Cloud CDN
- Monitor with Cloud Billing

## 🎯 Common Use Cases

### Wedding (200 guests, 2000 photos)
```env
CLOUD_STORAGE_PROVIDER=s3
# Cost: ~$5/month
```

### Corporate Event (50 guests, 500 photos)
```env
CLOUD_STORAGE_PROVIDER=mega
# Cost: Free
```

### Festival (1000 guests, 10000 photos)
```env
CLOUD_STORAGE_PROVIDER=s3
# Cost: ~$20/month
# Use CloudFront CDN
```

## 📚 Documentation Quick Links

| Need | Document |
|------|----------|
| Quick start | `CLOUD_QUICK_START.md` |
| Detailed setup | `CLOUD_STORAGE_SETUP.md` |
| Installation | `INSTALLATION_GUIDE.md` |
| API reference | `storage/README.md` |
| Features | `FEATURES.md` |
| Troubleshooting | `CLOUD_STORAGE_SETUP.md` |

## 🔄 Workflow Diagram

```
┌─────────────┐
│ User Upload │
└──────┬──────┘
       ↓
┌─────────────────┐
│ Cloud Storage   │ ← Primary storage
└──────┬──────────┘
       ↓
┌─────────────────┐
│ Local Sync      │ ← For processing
└──────┬──────────┘
       ↓
┌─────────────────┐
│ Face Recognition│
└──────┬──────────┘
       ↓
┌─────────────────┐
│ Matched Photos  │
└──────┬──────────┘
       ↓
┌─────────────────┐
│ Cloud Sync      │ ← Sync results
└──────┬──────────┘
       ↓
┌─────────────────┐
│ User Download   │ ← From cloud
└─────────────────┘
```

## 🎓 Learning Path

### Beginner
1. Read `CLOUD_QUICK_START.md`
2. Follow `INSTALLATION_GUIDE.md`
3. Start with MEGA (easiest)
4. Test with small event

### Intermediate
1. Read `CLOUD_STORAGE_SETUP.md`
2. Set up AWS S3
3. Configure CDN
4. Migrate existing data

### Advanced
1. Read `storage/README.md`
2. Create custom adapter
3. Optimize performance
4. Set up monitoring

## 🆘 Emergency Procedures

### Cloud Storage Down
1. Server automatically falls back to local
2. Continue operations normally
3. Files sync when cloud recovers

### Database Down
1. Restart MongoDB service
2. Check connection string
3. Verify network access

### Processing Fails
1. Check `face_processing.log`
2. Verify Python dependencies
3. Check disk space
4. Restart server

### Out of Storage
1. Check cloud provider quota
2. Clean up old events
3. Upgrade plan if needed
4. Enable lifecycle policies

## 📞 Support Resources

### Documentation
- Quick Start: 5 minutes
- Full Setup: 30 minutes
- API Docs: Reference
- Troubleshooting: Solutions

### Tools
- Test Suite: Diagnose issues
- Migration Tool: Move data
- Logs: Debug problems
- Health Check: Monitor status

### Community
- GitHub Issues
- Documentation
- Code Examples
- Best Practices

## ✅ Pre-Flight Checklist

Before going live:

- [ ] All tests pass
- [ ] Cloud storage configured
- [ ] MongoDB connected
- [ ] Email working
- [ ] Test event created
- [ ] Photos upload successfully
- [ ] Face recognition works
- [ ] Downloads work
- [ ] Backups configured
- [ ] Monitoring set up
- [ ] SSL certificate installed
- [ ] Domain configured
- [ ] Firewall rules set
- [ ] Performance tested
- [ ] Documentation reviewed

## 🎉 Success Indicators

You're ready when:

✅ `npm run test:cloud` shows 100% pass
✅ Server starts with "Cloud storage ready"
✅ Photos appear in cloud provider
✅ Face matching completes successfully
✅ Guests can download their photos
✅ Emails send automatically
✅ No errors in logs

---

**Keep this card handy for quick reference!**

**Version**: 2.0.0 Cloud Edition
**Last Updated**: 2025-09-30
**Status**: Production Ready ✅
