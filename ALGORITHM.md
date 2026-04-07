Algorithm

1. Face Ingestion & Embedding

Image Input (Event Photos):
Algorithm: DeepFace (VGG-Face embeddings) + Face Detection (MTCNN)
Data: Bulk event photos (photographer uploads)

Selfie Input (Guest Uploads):
Algorithm: DeepFace embeddings + Face Detection
Data: Guest selfies with email/event context

2. Face Matching & Ranking
Algorithm: Cosine/Euclidean distance matching over embeddings + Threshold tuning
Parameters:
- Matching threshold (default tuned per event)
- Top-k nearest neighbors per guest
- Face quality/occlusion checks

3. Personalized Delivery
Algorithm: Rule-based packaging + ML-based ranking (optional) for best-photo selection
Steps:
- Group matched photos per guest
- ZIP packaging via Archiver
- Secure links via JWT/OTP email delivery

4. Storage & Sync
Algorithm: Provider abstraction (S3/MEGA/GCS) with local-cache sync policy
Data: Event photo objects, matched outputs, ZIP artifacts

5. Security & Fraud Prevention
Algorithm: JWT auth + Rate limiting + Anomaly checks on download/email patterns
Signals:
- Unusual download frequency
- Repeated OTP failures
- IP/geolocation anomalies

6. Analytics & Feedback Loop
Algorithm: Aggregation over match stats and delivery metrics
Metrics:
- Match success rate / false positive rate
- Delivery success and open/click events (email)
- Processing latency per batch
