PROJECT TIMELINE - 12 WEEK DEVELOPMENT PLAN

• Week 1 – Literature survey and understanding system requirements
  Understanding AI/ML in photography, face recognition techniques (DeepFace, VGG-Face), cloud storage solutions, and PhotoFlow requirements

• Week 2 – Requirement analysis and system architecture design
  Define functional/non-functional requirements, design microservices architecture, plan database schema (MongoDB), and API endpoints

• Week 3 – Dataset collection for event photos and guest selfies
  Gather sample event photo datasets and guest selfie collections; prepare test event data with multiple photos and guests

• Week 4 – Data cleaning, preprocessing, and annotation
  Clean images (remove duplicates, corrupted files), normalize dimensions, annotate face regions, tag guest-photo relationships for validation

• Week 5 – Implementation of face embedding generation using DeepFace
  Implement VGG-Face embedding extraction, MTCNN face detection, embedding storage, and similarity computation pipelines

• Week 6 – Implementation of face matching and threshold tuning using ML
  Develop cosine/Euclidean distance matching, optimize threshold τ to minimize FPR/FNR, implement top-k photo selection per guest

• Week 7 – Photo ranking and personalization using ML scoring
  Create quality-aware scoring: q_ij = w_d·(-d_ij) + w_q·Q_i, rank photos by matching confidence and image quality metrics

• Week 8 – Cloud storage integration and multi-cloud support
  Integrate AWS S3, MEGA, GCS adapters; implement sync policies (upload/download/delete); add local-cache fallback mechanisms

• Week 9 – Security, authentication, and fraud detection implementation
  Implement JWT/OTP auth, rate limiting, anomaly detection (unusual downloads/login failures), encrypted file handling

• Week 10 – Integration of AI models with web/mobile application
  Connect backend APIs (Express.js) to frontend (HTML/CSS/JS), integrate face matching pipeline, ZIP packaging, email delivery

• Week 11 – System testing, validation, and performance evaluation
  Unit tests for matching accuracy, integration tests for upload-to-delivery flow, performance benchmarks (latency, throughput), security audits

• Week 12 – Final documentation, analytics dashboard, and project presentation
  Complete project documentation, finalize analytics dashboards (match stats, delivery metrics), prepare presentation and demo

