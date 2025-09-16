import face_recognition
import os
import shutil
import sys
import json
import logging
from pathlib import Path
from datetime import datetime
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('face_recognition.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

class EnhancedFaceProcessor:
    def __init__(self, event_path, tolerance: float = 0.45, margin: float = 0.10,
                 cnn_recheck: bool = True, recheck_delta_pad: float = 0.03, recheck_tolerance_pad: float = 0.05):
        self.event_path = Path(event_path)
        self.selfies_dir = self.event_path / "selfies"
        self.photos_dir = self.event_path / "photos"
        self.matched_dir = self.event_path / "matched"
        self.exports_dir = self.event_path / "exports"
        self.candidates_dir = self.event_path / "candidates"
        
        # Create directories if they don't exist
        self.matched_dir.mkdir(exist_ok=True)
        self.exports_dir.mkdir(exist_ok=True)
        self.candidates_dir.mkdir(exist_ok=True)
        
        # Diagnostics and candidate saving controls
        self.save_top_candidates = True
        self.top_candidates_k = 3
        self.max_candidate_distance = 0.90  # cap for saving candidates
        
        # Self-bootstrapping settings (two-pass refinement)
        self.bootstrap_enabled = True
        self.bootstrap_cutoff = 0.80     # collect faces up to this distance in pass-1
        self.bootstrap_min_samples = 5   # need at least this many to refine
        self.bootstrap_top_k = 30        # use top-K closest for centroid
        self.bootstrap_tolerance = 0.66  # re-match tolerance with refined centroid

        # Processing statistics
        self.stats = {
            'total_selfies': 0,
            'valid_selfies': 0,
            'total_photos': 0,
            'total_matches': 0,
            'guests_processed': 0,
            'processing_time': 0
        }
        self.tolerance = float(tolerance)
        self.margin = float(margin)  # second-best distance must be at least margin further
        # Relaxed thresholds to allow near-true positives to pass with caution
        self.relaxed_tolerance = min(0.78, self.tolerance + 0.10)
        self.relaxed_margin = max(0.02, self.margin * 0.5)
        # CNN recheck settings
        self.cnn_recheck = bool(cnn_recheck)
        self.recheck_delta_pad = float(recheck_delta_pad)  # if delta < margin + pad -> recheck
        self.recheck_tolerance_pad = float(recheck_tolerance_pad)  # if best < tol + pad -> recheck
        # Cache for guest CNN encodings to avoid repeated recompute (email -> list[np.ndarray])
        self._guest_cnn_cache = {}
        
        # De-duplication sets across whole run
        self._matched_records = set()    # set[(guest_email, filename)]
        self._candidate_records = set()  # set[(guest_email, filename)]

    def _unique_path(self, path: Path) -> Path:
        """Return a unique file path by appending _1, _2, ... if needed."""
        if not path.exists():
            return path
        stem, suffix = path.stem, path.suffix
        i = 1
        while True:
            candidate = path.with_name(f"{stem}_{i}{suffix}")
            if not candidate.exists():
                logging.info(f"      Duplicate filename detected, writing as: {candidate.name}")
                return candidate
            i += 1

    def validate_directories(self):
        """Validate that all required directories exist and are accessible"""
        logging.info("VALIDATING DIRECTORIES...")
        
        if not self.selfies_dir.exists():
            logging.error(f"ERROR: Selfie directory not found: {self.selfies_dir}")
            return False
            
        if not self.photos_dir.exists():
            logging.error(f"ERROR: Photos directory not found: {self.photos_dir}")
            return False

        # Count selfies with detailed logging
        selfie_count = 0
        guest_folders = []
        
        for guest_folder in self.selfies_dir.iterdir():
            if guest_folder.is_dir():
                guest_folders.append(guest_folder.name)
                folder_files = []
                for file in guest_folder.iterdir():
                    if file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']:
                        selfie_count += 1
                        folder_files.append(file.name)
                logging.info(f"Guest {guest_folder.name}: {len(folder_files)} files - {folder_files}")

        photo_files = [f for f in self.photos_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']]

        logging.info(f"Found {len(guest_folders)} guest folders: {guest_folders}")
        logging.info(f"Found {selfie_count} total selfie files")
        logging.info(f"Found {len(photo_files)} photo files")

        if selfie_count == 0:
            logging.warning(f"WARNING: No selfie files found in: {self.selfies_dir}")
            return False

        if not photo_files:
            logging.error(f"ERROR: No photo files found in: {self.photos_dir}")
            return False

        logging.info(f"SUCCESS: Found {selfie_count} selfie files and {len(photo_files)} photo files")
        self.stats['total_selfies'] = selfie_count
        self.stats['total_photos'] = len(photo_files)
        return True

    def safe_load_image(self, image_path):
        """Safely load an image with error handling"""
        try:
            if not image_path.exists():
                logging.warning(f"File not found: {image_path}")
                return None

            # Check file size
            file_size = image_path.stat().st_size
            if file_size == 0:
                logging.warning(f"Empty file: {image_path}")
                return None

            if file_size > 50 * 1024 * 1024:  # 50MB limit
                logging.warning(f"File too large ({file_size/1024/1024:.1f}MB): {image_path}")
                return None

            # Load the image
            image = face_recognition.load_image_file(str(image_path))
            
            # Add this logging line:
            logging.info(f"Loaded image {image_path.name}: {image.shape}")

            # Validate image dimensions
            if image.shape[0] < 50 or image.shape[1] < 50:
                logging.warning(f"Image too small ({image.shape[1]}x{image.shape[0]}): {image_path}")
                return None

            return image

        except Exception as e:
            logging.error(f"Error loading {image_path}: {str(e)}")
            return None

    def safe_get_encodings(self, image, image_path, num_jitters: int = 0, force_cnn: bool = False, encode_model: str = "small"):
        """Enhanced face encoding with multiple detection models"""
        try:
            if image is None:
                return []

            # If forcing CNN, try CNN first
            if force_cnn:
                try:
                    face_locations_cnn = face_recognition.face_locations(
                        image,
                        number_of_times_to_upsample=1,
                        model="cnn"
                    )
                    if face_locations_cnn:
                        encodings_cnn = face_recognition.face_encodings(image, face_locations_cnn, model=encode_model)
                        logging.info(f"CNN[force] found {len(encodings_cnn)} faces in {image_path.name}")
                        return encodings_cnn
                except Exception as e:
                    logging.warning(f"CNN[force] failed for {image_path.name}: {str(e)}")
                # If CNN forced but failed, do not continue to HOG here; return empty
                return []

            # Try HOG model first (faster). If num_jitters>0, use it to stabilize encodings (mainly for selfies)
            if num_jitters and num_jitters > 0:
                encodings = face_recognition.face_encodings(image, model=encode_model, num_jitters=int(num_jitters))
            else:
                encodings = face_recognition.face_encodings(image, model=encode_model)
            if encodings:
                logging.info(f"HOG model found {len(encodings)} faces in {image_path.name}")
                return encodings

            # Try with different parameters - look harder for faces
            face_locations = face_recognition.face_locations(
                image, 
                number_of_times_to_upsample=2,
                model="hog"
            )
            if face_locations:
                encodings = face_recognition.face_encodings(image, face_locations, model=encode_model)
                logging.info(f"Enhanced detection found {len(encodings)} faces in {image_path.name}")
                return encodings

            # CNN fallback (slower but more accurate); works on CPU too
            try:
                face_locations_cnn = face_recognition.face_locations(
                    image,
                    number_of_times_to_upsample=1,
                    model="cnn"
                )
                if not face_locations_cnn:
                    # Retry with a stronger upsample for crowded/small faces
                    face_locations_cnn = face_recognition.face_locations(
                        image,
                        number_of_times_to_upsample=2,
                        model="cnn"
                    )
                if face_locations_cnn:
                    encodings_cnn = face_recognition.face_encodings(image, face_locations_cnn, model=encode_model)
                    logging.info(f"CNN model found {len(encodings_cnn)} faces in {image_path.name}")
                    return encodings_cnn
            except Exception as e:
                logging.warning(f"CNN fallback failed for {image_path.name}: {str(e)}")

            logging.warning(f"No faces detected in {image_path.name} with all methods")
            return []

        except Exception as e:
            logging.error(f"Error getting encodings for {image_path}: {str(e)}")
            return []

    def load_guest_selfies(self):
        """Load and process guest selfies from email-based folders.
        Returns a dict: guest_email -> list of encodings (may contain multiple from different selfies)
        """
        logging.info("LOADING GUEST SELFIES...")
        guest_encodings = {}
        
        # Look for guest email folders in selfies directory
        for guest_folder in self.selfies_dir.iterdir():
            if guest_folder.is_dir():
                guest_email = guest_folder.name
                logging.info(f"  Processing guest: {guest_email}")
                
                # Find all image files in this guest's folder
                selfie_files = [f for f in guest_folder.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']]
                
                if not selfie_files:
                    logging.warning(f"  WARNING: No selfie files found for {guest_email}")
                    continue
                
                # Process selfies for this guest; keep multiple encodings to improve robustness
                for selfie_file in selfie_files:
                    logging.info(f"    Processing: {selfie_file.name}")
                    
                    # Safe image loading
                    img = self.safe_load_image(selfie_file)
                    if img is None:
                        continue

                    # Safe encoding extraction
                    # For selfies, use slight jitter to make embeddings more robust
                    encodings = self.safe_get_encodings(img, selfie_file, num_jitters=3, encode_model="large")
                    if encodings:
                        first_enc = encodings[0]
                        guest_encodings.setdefault(guest_email, []).append(first_enc)
                        logging.info(f"    SUCCESS: Loaded selfie for {guest_email}")
                        self.stats['valid_selfies'] += 1
                    else:
                        logging.warning(f"    No face found in {selfie_file.name}")

        if not guest_encodings:
            logging.error("ERROR: No valid guest selfies loaded. Cannot proceed.")
            return {}
        
        logging.info(f"SUCCESS: Loaded selfies for {len(guest_encodings)} guests.")
        self.stats['guests_processed'] = len(guest_encodings)
        return guest_encodings

    def process_event_photos(self, guest_encodings):
        """Process event photos and match with guest selfies"""
        logging.info("PROCESSING EVENT PHOTOS...")
        logging.info(f"Using face match tolerance: {self.tolerance}")
        logging.info(f"Using second-best margin: {self.margin}")
        logging.info(f"Using RELAXED tolerance: {self.relaxed_tolerance}")
        logging.info(f"Using RELAXED margin: {self.relaxed_margin}")
        logging.info(f"CNN recheck enabled: {self.cnn_recheck} (δ_pad={self.recheck_delta_pad}, tol_pad={self.recheck_tolerance_pad})")
        # If only one guest exists, relax thresholds and ignore margin since there is no second-best competitor
        num_guests = len(guest_encodings.keys())
        single_guest_mode = (num_guests == 1)
        if single_guest_mode:
            logging.info("SINGLE-GUEST MODE: relaxing thresholds and skipping CNN recheck.")
        photo_files = [f for f in self.photos_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']]
        total_matches = 0

        # Pass-1: collect loose candidates per guest for bootstrapping
        boot_candidates = {email: [] for email in guest_encodings.keys()}  # list of (distance, photo_path, face_idx)

        for i, photo_file in enumerate(photo_files, 1):
            logging.info(f"  Processing photo {i}/{len(photo_files)}: {photo_file.name}")

            # Safe image loading
            photo_img = self.safe_load_image(photo_file)
            if photo_img is None:
                continue

            # Safe encoding extraction
            # Use higher-quality encodings for event photos to reduce distance gaps
            photo_encodings = self.safe_get_encodings(photo_img, photo_file, encode_model="large")
            if not photo_encodings:
                logging.warning(f"    No faces detected in {photo_file.name}")
                continue

            # Adaptive thresholds for group photos (more faces => stricter)
            faces_in_photo = len(photo_encodings)
            tol_adj = 0.0
            margin_adj = 0.0
            if faces_in_photo >= 5:
                tol_adj -= 0.02  # demand slightly closer match
                margin_adj += 0.03
            if faces_in_photo >= 8:
                tol_adj -= 0.03
                margin_adj += 0.05
            eff_tol = max(0.01, self.tolerance + tol_adj)
            eff_margin = max(0.0, self.margin + margin_adj)
            eff_relaxed_tol = min(0.85, self.relaxed_tolerance + tol_adj)
            eff_relaxed_margin = max(0.01, self.relaxed_margin + (margin_adj * 0.5))
            if single_guest_mode:
                # Typical good-match distances: 0.55–0.70 depending on lighting/pose
                eff_tol = max(eff_tol, 0.66)
                eff_relaxed_tol = max(eff_relaxed_tol, 0.70)
                eff_margin = 0.0
                eff_relaxed_margin = 0.0
            logging.info(f"    Faces detected: {faces_in_photo} | tol={eff_tol:.3f} margin={eff_margin:.3f} (relaxed tol={eff_relaxed_tol:.3f} margin={eff_relaxed_margin:.3f})")

            # Heuristic: treat very large images as memory-heavy; skip CNN recheck on these
            try:
                h, w = int(photo_img.shape[0]), int(photo_img.shape[1])
            except Exception:
                h = w = 0
            is_large_image = max(h, w) >= 3000  # DSLR-sized frames are heavy for CNN on CPU

            # Build per-guest centroid (averaged embedding) plus raw encodings
            # Centroid helps stabilize when selfie is low-res or noisy
            flat_vectors = []
            flat_emails = []
            for g_email, vecs in guest_encodings.items():
                vec_list = (vecs if isinstance(vecs, list) else [vecs])
                try:
                    centroid = np.mean(np.stack(vec_list, axis=0), axis=0)
                    flat_vectors.append(centroid)
                    flat_emails.append(g_email)
                except Exception:
                    pass
                for v in vec_list:
                    flat_vectors.append(v)
                    flat_emails.append(g_email)

            matched = False
            matched_emails = set()  # collect unique guests found in this photo
            try:
                for face_idx, face_encoding in enumerate(photo_encodings):
                    if not flat_vectors:
                        break
                    distances = face_recognition.face_distance(flat_vectors, face_encoding)
                    # Aggregate by guest: take the minimum distance per email
                    per_guest_min = {}
                    for idx, d in enumerate(distances):
                        email = flat_emails[idx]
                        val = float(d)
                        if email not in per_guest_min or val < per_guest_min[email]:
                            per_guest_min[email] = val
                    # Sort guests by their best (min) distance
                    ranked = sorted(per_guest_min.items(), key=lambda kv: kv[1])
                    best_match_email, best_distance = (ranked[0] if ranked else (None, float('inf')))
                    second_best = ranked[1][1] if len(ranked) > 1 else float('inf')

                    # Collect bootstrap candidates (loose cutoff)
                    if self.bootstrap_enabled and best_match_email and best_distance <= self.bootstrap_cutoff:
                        boot_candidates[best_match_email].append((best_distance, photo_file, face_idx))

                    # Apply stricter acceptance: under tolerance and sufficiently better than second-best
                    delta = (second_best - best_distance)
                    # Auto-force recheck for crowded scenes (unless single-guest) and avoid CNN on oversized frames
                    force_group_recheck = (faces_in_photo >= 5) and (not single_guest_mode)
                    need_recheck = (self.cnn_recheck and not single_guest_mode or force_group_recheck) and (not is_large_image) and (
                        (best_distance < (self.tolerance + self.recheck_tolerance_pad)) or
                        (delta < (self.margin + self.recheck_delta_pad))
                    )

                    def confirm_with_cnn():
                        # Re-encode current photo with CNN and recompute ranking
                        cnn_photo_encs = self.safe_get_encodings(photo_img, photo_file, force_cnn=True, encode_model="large")
                        if not cnn_photo_encs:
                            return False, None, None, None
                        # Optionally compute/cached CNN encodings per guest to increase precision
                        flat_vectors_cnn = []
                        flat_emails_cnn = []
                        for g_email, vecs in guest_encodings.items():
                            # lazily fill cache with original HOG vecs (approx) for speed; if you want strict CNN for selfies, you can compute here
                            cached = self._guest_cnn_cache.get(g_email)
                            if cached is None:
                                # Fall back to original vectors; computing strict CNN for selfies can be expensive and requires reloading selfie images
                                self._guest_cnn_cache[g_email] = vecs
                                cached = vecs
                            for v in (cached if isinstance(cached, list) else [cached]):
                                flat_vectors_cnn.append(v)
                                flat_emails_cnn.append(g_email)

                        # Use first CNN face encoding (or iterate through all and pick best)
                        best_email_cnn = None
                        best_dist_cnn = float('inf')
                        second_cnn = float('inf')
                        for face_encoding_cnn in cnn_photo_encs:
                            distances_cnn = face_recognition.face_distance(flat_vectors_cnn, face_encoding_cnn)
                            per_guest_min_cnn = {}
                            for idx, d in enumerate(distances_cnn):
                                email = flat_emails_cnn[idx]
                                val = float(d)
                                if email not in per_guest_min_cnn or val < per_guest_min_cnn[email]:
                                    per_guest_min_cnn[email] = val
                            ranked_cnn = sorted(per_guest_min_cnn.items(), key=lambda kv: kv[1])
                            if ranked_cnn:
                                if ranked_cnn[0][1] < best_dist_cnn:
                                    best_email_cnn, best_dist_cnn = ranked_cnn[0]
                                    second_cnn = ranked_cnn[1][1] if len(ranked_cnn) > 1 else float('inf')
                        return True, best_email_cnn, best_dist_cnn, second_cnn

                    if best_distance < eff_tol and (delta >= eff_margin or single_guest_mode):
                        if need_recheck:
                            ok, best_email_cnn, best_dist_cnn, second_cnn = confirm_with_cnn()
                            if not ok or best_email_cnn != best_match_email:
                                logging.info(f"    CNN REJECT: {photo_file.name} best={best_match_email} (HOG {best_distance:.3f}/Δ{delta:.3f})")
                                continue
                            # apply the same thresholds (optionally slightly stricter)
                            if not (best_dist_cnn < max(eff_tol - 0.00, 0.01) and (second_cnn - best_dist_cnn) >= max(eff_margin - 0.00, 0.0)):
                                logging.info(f"    CNN REJECT THRESH: {photo_file.name} cnnBest={best_dist_cnn:.3f} cnnΔ={(second_cnn - best_dist_cnn):.3f}")
                                continue
                        match_key = (best_match_email, photo_file.name)
                        destination = self.matched_dir / best_match_email / photo_file.name
                        if match_key in self._matched_records or destination.exists():
                            logging.info(f"    SKIP DUPLICATE: {photo_file.name} already matched for {best_match_email}")
                        else:
                            guest_folder = self.matched_dir / best_match_email
                            guest_folder.mkdir(exist_ok=True)
                            shutil.copy2(photo_file, destination)
                            self._matched_records.add(match_key)
                            logging.info(
                                f"    SUCCESS: Matched {photo_file.name} -> {best_match_email} "
                                f"(best: {best_distance:.3f}, second: {second_best:.3f}, margin: {second_best - best_distance:.3f})"
                            )
                            matched_emails.add(best_match_email)
                            total_matches += 1
                    # Relaxed acceptance: slightly looser thresholds to rescue close matches
                    elif best_distance < eff_relaxed_tol and (delta >= eff_relaxed_margin or single_guest_mode):
                        if need_recheck:
                            ok, best_email_cnn, best_dist_cnn, second_cnn = confirm_with_cnn()
                            if not ok or best_email_cnn != best_match_email:
                                logging.info(f"    CNN REJECT (RELAXED): {photo_file.name} best={best_match_email} (HOG {best_distance:.3f}/Δ{delta:.3f})")
                                continue
                            # use slightly stricter thresholds than relaxed when confirming
                            strict_tol = min(eff_relaxed_tol, eff_tol + (self.recheck_tolerance_pad * 0.5))
                            strict_margin = max(eff_relaxed_margin, eff_margin * 0.5)
                            if not (best_dist_cnn < strict_tol and (second_cnn - best_dist_cnn) >= strict_margin):
                                logging.info(f"    CNN REJECT THRESH (RELAXED): {photo_file.name} cnnBest={best_dist_cnn:.3f} cnnΔ={(second_cnn - best_dist_cnn):.3f}")
                                continue
                        match_key = (best_match_email, photo_file.name)
                        destination = self.matched_dir / best_match_email / photo_file.name
                        if match_key in self._matched_records or destination.exists():
                            logging.info(f"    SKIP DUPLICATE: {photo_file.name} already matched for {best_match_email}")
                        else:
                            guest_folder = self.matched_dir / best_match_email
                            guest_folder.mkdir(exist_ok=True)
                            shutil.copy2(photo_file, destination)
                            self._matched_records.add(match_key)
                            logging.info(
                                f"    SUCCESS: Matched {photo_file.name} -> {best_match_email} "
                                f"(best: {best_distance:.3f}, second: {second_best:.3f}, margin: {second_best - best_distance:.3f})"
                            )
                            matched_emails.add(best_match_email)
                            total_matches += 1
                    else:
                        # Log top-K guest distances for debugging
                        preview = ", ".join([f"{email}:{dist:.3f}" for email, dist in ranked[:max(1, self.top_candidates_k)]])
                        logging.info(
                            f"    REJECTED: {photo_file.name} best={best_distance:.3f}, "
                            f"second={second_best:.3f}, Δ={second_best - best_distance:.3f} "
                            f"(threshold={self.tolerance}, margin={self.margin}) | top: {preview}"
                        )
                        # Always export top candidate for manual review (within a sane max distance)
                        if self.save_top_candidates and best_match_email and best_distance <= self.max_candidate_distance:
                            cand_key = (best_match_email, photo_file.name)
                            cand_path = self.candidates_dir / best_match_email / photo_file.name
                            if cand_key in self._candidate_records or cand_path.exists():
                                logging.info(f"    CANDIDATE SKIP DUPLICATE: {photo_file.name} for {best_match_email}")
                            else:
                                cand_guest_dir = self.candidates_dir / best_match_email
                                cand_guest_dir.mkdir(parents=True, exist_ok=True)
                                shutil.copy2(photo_file, cand_path)
                                self._candidate_records.add(cand_key)
                                logging.info(f"    CANDIDATE SAVED: {cand_path.relative_to(self.event_path)}")
                    if need_recheck and is_large_image:
                        logging.info(f"    CNN SKIPPED (LARGE {w}x{h}): {photo_file.name}")
                    elif is_large_image and (self.cnn_recheck or force_group_recheck):
                        logging.info(f"    CNN SKIPPED (LARGE {w}x{h}): {photo_file.name}")

            except Exception as e:
                logging.error(f"    Error processing {photo_file.name}: {str(e)}")
                continue

            if matched_emails:
                matched = True

            if not matched:
                logging.info(f"    No match found for {photo_file.name}")

        # Pass-2: if enough candidates exist, refine a centroid and re-match with a dedicated tolerance
        if self.bootstrap_enabled:
            refined_vectors = {}
            for email, items in boot_candidates.items():
                if len(items) >= self.bootstrap_min_samples:
                    # sort by distance asc and keep top-K indices (we'll recompute encodings per photo)
                    items_sorted = sorted(items, key=lambda t: t[0])[: self.bootstrap_top_k]
                    acc = []
                    for _, pfile, _ in items_sorted:
                        img = self.safe_load_image(pfile)
                        if img is None:
                            continue
                        encs = self.safe_get_encodings(img, pfile, encode_model="large")
                        if not encs:
                            continue
                        # choose closest face in this photo to the guest by pass-1 estimate
                        # since we don't know face index reliably now, take all
                        acc.extend(encs)
                    if acc:
                        try:
                            refined = np.median(np.stack(acc, axis=0), axis=0)
                            refined_vectors[email] = refined
                            logging.info(f"REFINED CENTROID READY for {email}: {len(acc)} vectors")
                        except Exception as e:
                            logging.warning(f"Failed to build refined centroid for {email}: {str(e)}")

            if refined_vectors:
                logging.info(f"PASS-2: Re-matching with refined centroids (tol={self.bootstrap_tolerance})...")
                for i, photo_file in enumerate(photo_files, 1):
                    photo_img = self.safe_load_image(photo_file)
                    if photo_img is None:
                        continue
                    photo_encodings = self.safe_get_encodings(photo_img, photo_file, encode_model="large")
                    if not photo_encodings:
                        continue
                    for face_encoding in photo_encodings:
                        # distances to refined centroids only
                        emails = list(refined_vectors.keys())
                        vecs = [refined_vectors[e] for e in emails]
                        dists = face_recognition.face_distance(vecs, face_encoding)
                        if not len(dists):
                            continue
                        m_idx = int(np.argmin(dists))
                        m_email = emails[m_idx]
                        m_dist = float(dists[m_idx])
                        if m_dist < self.bootstrap_tolerance:
                            match_key = (m_email, photo_file.name)
                            destination = self.matched_dir / m_email / photo_file.name
                            if match_key in self._matched_records or destination.exists():
                                logging.info(f"    PASS-2 SKIP DUPLICATE: {photo_file.name} already matched for {m_email}")
                            else:
                                try:
                                    guest_folder = self.matched_dir / m_email
                                    guest_folder.mkdir(exist_ok=True)
                                    shutil.copy2(photo_file, destination)
                                    self._matched_records.add(match_key)
                                    total_matches += 1
                                    logging.info(f"    PASS-2 SUCCESS: {photo_file.name} -> {m_email} (d={m_dist:.3f})")
                                except Exception:
                                    pass

        self.stats['total_matches'] = total_matches
        return total_matches

    def generate_processing_report(self):
        """Generate a processing report"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'event_path': str(self.event_path),
            'statistics': self.stats,
            'success': True
        }

        report['diagnostics'] = {
            'tolerance': self.tolerance,
            'margin': self.margin,
            'relaxed_tolerance': self.relaxed_tolerance,
            'relaxed_margin': self.relaxed_margin,
            'cnn_recheck': self.cnn_recheck
        }

        report_file = self.event_path / 'processing_report.json'
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)

        logging.info(f"Processing report saved: {report_file}")
        return report

    def run(self):
        """Main processing function"""
        start_time = datetime.now()
        logging.info(f"STARTING FACE RECOGNITION PROCESSING FOR EVENT: {self.event_path}")

        try:
            # Validate directories
            if not self.validate_directories():
                logging.error("Directory validation failed. Exiting.")
                return False

            # Load guest selfies
            guest_encodings = self.load_guest_selfies()
            if not guest_encodings:
                logging.error("Failed to load guest selfies")
                return False

            # Process event photos
            total_matches = self.process_event_photos(guest_encodings)

            # Calculate processing time
            end_time = datetime.now()
            self.stats['processing_time'] = (end_time - start_time).total_seconds()

            # Generate report
            self.generate_processing_report()

            # Final statistics
            logging.info("PROCESSING COMPLETE!")
            logging.info(f"  Total selfies: {self.stats['total_selfies']}")
            logging.info(f"  Valid selfies: {self.stats['valid_selfies']}")
            logging.info(f"  Total photos: {self.stats['total_photos']}")
            logging.info(f"  Photos matched: {self.stats['total_matches']}")
            logging.info(f"  Guests processed: {self.stats['guests_processed']}")
            logging.info(f"  Processing time: {self.stats['processing_time']:.2f} seconds")
            logging.info(f"  Match rate: {(self.stats['total_matches']/self.stats['total_photos']*100):.1f}%" if self.stats['total_photos'] > 0 else "0%")

            return True

        except Exception as e:
            logging.error(f"Unexpected error during processing: {str(e)}")
            return False

def main():
    """Main entry point"""
    if len(sys.argv) not in (2, 3, 4, 5):
        print("Usage: python enhanced_face_match.py <event_path> [tolerance] [margin] [cnn_recheck:0|1]")
        sys.exit(1)

    event_path = sys.argv[1]
    tolerance = float(sys.argv[2]) if len(sys.argv) >= 3 else 0.45
    margin = float(sys.argv[3]) if len(sys.argv) >= 4 else 0.10
    cnn_recheck = bool(int(sys.argv[4])) if len(sys.argv) >= 5 else True
    processor = EnhancedFaceProcessor(event_path, tolerance, margin, cnn_recheck=cnn_recheck)

    try:
        success = processor.run()
        if success:
            logging.info("FACE RECOGNITION PROCESSING COMPLETED SUCCESSFULLY!")
            sys.exit(0)
        else:
            logging.error("FACE RECOGNITION PROCESSING FAILED!")
            sys.exit(1)

    except KeyboardInterrupt:
        logging.warning("Processing interrupted by user")
        sys.exit(1)
    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
