Mathematical AI Model

1. Face Embedding Generation
- Model: DeepFace (VGG-Face)
- Given an image \(x\), embedding function \(f_\theta\) outputs \(e = f_\theta(x) \in \mathbb{R}^d\).
- Faces: photographer photo embeddings \(\{e_i\}\); guest selfie embeddings \(\{s_j\}\).

2. Similarity Computation
- Distance: \(d_{ij} = \lVert e_i - s_j \rVert_2\) (Euclidean) or cosine \(1 - \frac{e_i \cdot s_j}{\lVert e_i\rVert\,\lVert s_j\rVert}\).
- Match if \(d_{ij} \le \tau\) where \(\tau\) is the tuned threshold.

3. Threshold Tuning
- Objective: minimize \(\text{FPR}(\tau) + \text{FNR}(\tau)\).
- Select \(\tau^* = \arg\min_\tau \big(\alpha\,\text{FPR}(\tau) + (1-\alpha)\,\text{FNR}(\tau)\big)\) with \(\alpha\) balancing precision/recall.

4. Best-Match Selection (Top-k)
- For each guest \(j\), rank photos by ascending \(d_{ij}\).
- Select \(k\) photos: \(\mathcal{P}_j = \text{TopK}_k(\{d_{ij}\}_i)\).

5. Quality-Aware Scoring (optional)
- Score: \(q_{ij} = w_d\,(-d_{ij}) + w_q\,Q_i\), where \(Q_i\) is image quality (sharpness/brightness) and \(w_d, w_q\) are weights.
- Rank by \(q_{ij}\) instead of \(d_{ij}\).

6. Package & Delivery
- Group per guest: \(G_j = \{\text{photos in } \mathcal{P}_j\}\).
- Compress via ZIP; send secure link/token.

7. Analytics Metrics
- Precision: \(\text{TP} / (\text{TP} + \text{FP})\).
- Recall: \(\text{TP} / (\text{TP} + \text{FN})\).
- Match rate: \(|\{(i,j): d_{ij}\le\tau\}| / |\text{photos}|\).
- Latency: end-to-end processing time per batch.

8. Security/Anomaly Signals (heuristic)
- Unusual downloads per guest: \(u = \frac{\text{downloads}_j}{\text{median downloads}}\).
- OTP failure rate spike: \(r = \frac{\text{failures}}{\text{attempts}}\).

Notes
- \(\tau\) can be event-specific based on validation selfies.
- Distance metric choice (L2 vs cosine) should match embedding training.
