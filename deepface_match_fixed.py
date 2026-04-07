import os
import sys
import shutil
import json
import logging
import tempfile
from pathlib import Path
from datetime import datetime
from deepface import DeepFace
from PIL import Image
import cv2 # Essential for image drawing/processing

# --- Configuration for Demo/Local Execution ---
# Define a standard directory structure for testing the Colab logic
# NOTE: Replace these with your actual paths if not using the demo
TEST_DIR = Path("test_event_data")
TEST_SELDIE_DIR = TEST_DIR / "selfies"
TEST_DB_DIR = TEST_DIR / "db"
TEST_PHOTOS_DIR = TEST_DIR / "photos"
TEST_PROCESSED_FIND_DIR = TEST_DIR / "processed_find" # New dir for single find results

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('face_processing.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

def show_image_local(window_name, img):
    """
    Utility function to display an image locally (VS Code/Desktop).
    Replace with your platform-specific display if needed (e.g., cv2_imshow for Colab).
    """
    try:
        cv2.imshow(window_name, img)
        cv2.waitKey(1) # Wait 1ms to allow image display in loop
        # cv2.destroyAllWindows() # Keep window open until main program exits
    except Exception as e:
        # This warning is common when running in environments without a display server (e.g., WSL, CI/CD, pure CLI)
        logging.warning(f"Could not display image (likely no display environment): {e}")


class DeepFaceProcessor:
    def __init__(self, event_path, similarity_threshold=0.3, detector_backend="retinaface"):
        self.event_path = Path(event_path)
        self.selfies_dir = self.event_path / "selfies"
        self.photos_dir = self.event_path / "photos"
        self.matched_dir = self.event_path / "matched"
        self.exports_dir = self.event_path / "exports"
        
        # Create directories if they don't exist
        self.matched_dir.mkdir(exist_ok=True)
        self.exports_dir.mkdir(exist_ok=True)
        
        # Configuration
        self.similarity_threshold = float(similarity_threshold)
        self.detector_backend = detector_backend
        self.model_name = "VGG-Face"  # Using VGG-Face for better accuracy (original model)
        
        # Pre-load the model to ensure weights are downloaded
        try:
            logging.info("Initializing face recognition model...")
            DeepFace.build_model(self.model_name)
            logging.info("Face recognition model initialized successfully")
        except Exception as e:
            logging.error(f"Failed to initialize face recognition model: {str(e)}")
            raise RuntimeError("Failed to initialize face recognition model. Please ensure model weights are downloaded correctly.")
        
        # Stats
        self.stats = {
            'total_selfies': 0,
            'valid_selfies': 0,
            'total_photos': 0,
            'total_matches': 0,
            'guests_processed': 0,
            'processing_time': 0
        }

    # ----------------------------------------------------------------------
    # NEW FEATURE: Method to visualize DeepFace.find() results (from Colab code)
    # ----------------------------------------------------------------------
    def visualize_deepface_find_results(self, dfs: list, processed_output_dir: Path):
        """
        Processes DeepFace.find() results (list of DataFrames) to draw bounding 
        boxes and save the matched images. This replicates the Colab code's visualization.
        
        Args:
            dfs (list): The list of pandas DataFrames returned by DeepFace.find().
            processed_output_dir (Path): The directory to save the marked images.
        """
        logging.info("Starting visualization of DeepFace.find() results...")
        processed_output_dir.mkdir(exist_ok=True)
        
        # The DFS list contains one DataFrame for each face detected in the query image.
        for i, df in enumerate(dfs):
            # Check if the DataFrame is empty (i.e., no match found for this face)
            if df.empty:
                logging.warning(f"Face {i+1}/{len(dfs)} had no matches in the database.")
                continue

            logging.info(f"Processing matches for query face {i+1}/{len(dfs)} ({len(df)} results)...")

            for idx, row in df.iterrows():
                try:
                    # 'identity' is the path to the image in the DB that matched the query face
                    img_path = str(row["identity"])
                    # DeepFace returns x, y, w, h for the *target* face in the identity image
                    # NOTE: Ensure these columns exist in the DataFrame output.
                    x, y, w, h = int(row["target_x"]), int(row["target_y"]), int(row["target_w"]), int(row["target_h"])
                    
                    # Read the image
                    img = cv2.imread(img_path)
                    if img is None:
                        logging.warning(f"⚠️ Could not read {img_path}")
                        continue
                        
                    # Draw rectangle (Colab logic)
                    cv2.rectangle(img, (x, y), (x+w, y+h), (0, 255, 0), 3)
                    
                    # Add distance/confidence text (Colab logic)
                    distance = row['distance']
                    
                    # NOTE: The 'confidence' column is often synthesized in DeepFace examples 
                    # as (1 - distance) or similar. For consistency with the Colab code's 
                    # requested label format, we'll try to use the distance directly.
                    # Since confidence isn't a direct output, we'll mimic the requested string format.
                    # For demonstration, let's assume confidence = 100 * (1 - distance / threshold) if metric is cosine/euclidean
                    # but we'll stick to displaying distance and a dummy "confidence" for the VS Code conversion:
                    # In your Colab code, 'confidence' is likely synthesized or an artifact of the environment.
                    # We will use distance and a default placeholder for 'conf'.
                    
                    # Replicating the exact label format from your Colab code:
                    label = f"dist={distance:.2f}, conf={row.get('confidence', 0.0) * 100:.1f}%"
                    
                    # Fallback if 'confidence' isn't available in the DataFrame (typical for Facenet512/angular)
                    if 'confidence' not in row:
                        # Angle-to-confidence is non-trivial, so we just show dist.
                        label = f"dist={distance:.4f}" 
                        
                    cv2.putText(img, label, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
                    
                    # Save to processed folder (Colab logic)
                    filename = os.path.basename(img_path)
                    # Unique filename for saving:
                    save_path = processed_output_dir / f"face{i+1}_match{idx}_{filename}"
                    cv2.imwrite(str(save_path), img)
                    
                    logging.info(f"Saved processed match: {save_path}")

                    # (Optional) Show inline using local viewer (Replaces cv2_imshow)
                    show_image_local(f"Match {i+1}-{idx}: {filename}", img)

                except Exception as e:
                    logging.error(f"Error processing row {idx} for face {i+1}: {str(e)}")
                    continue

        logging.info(f"✅ All processed images saved to {processed_output_dir}")
        return True

    # ----------------------------------------------------------------------
    # EXISTING DeepFaceProcessor methods (Kept as is)
    # ----------------------------------------------------------------------

    def validate_directories(self):
        """Validate that all required directories exist and are accessible"""
        logging.info("VALIDATING DIRECTORIES...")
        
        if not self.selfies_dir.exists():
            logging.error(f"ERROR: Selfie directory not found: {self.selfies_dir}")
            return False
            
        if not self.photos_dir.exists():
            logging.error(f"ERROR: Photos directory not found: {self.photos_dir}")
            return False

        try:
            # Count selfies with detailed logging
            selfie_count = 0
            guest_folders = []
            
            for guest_folder in self.selfies_dir.iterdir():
                if guest_folder.is_dir():
                    guest_folders.append(guest_folder.name)
                    folder_files = []
                    for file in guest_folder.iterdir():
                        if file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                            selfie_count += 1
                            folder_files.append(file.name)
                    logging.info(f"Guest {guest_folder.name}: {len(folder_files)} files - {folder_files}")

            photo_files = [f for f in self.photos_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']]

            logging.info(f"Found {len(guest_folders)} guest folders: {guest_folders}")
            logging.info(f"Found {selfie_count} total selfie files")
            logging.info(f"Found {len(photo_files)} photo files")

            if selfie_count == 0:
                logging.warning(f"WARNING: No selfie files found in: {self.selfies_dir}")
                # return False # Allow processing if DB is pre-built, but warn

            if not photo_files:
                logging.error(f"ERROR: No photo files found in: {self.photos_dir}")
                return False

            self.stats['total_selfies'] = selfie_count
            self.stats['total_photos'] = len(photo_files)
            return True
            
        except Exception as e:
            logging.error(f"Error validating directories: {str(e)}")
            return False

    def process_event_photos(self):
        """Process event photos and match with guest selfies"""
        total_matches = 0

        try:
            if not self.validate_directories():
                return 0

            # Get list of all photos
            photo_files = [f for f in self.photos_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']]
            self.stats['total_photos'] = len(photo_files)
            logging.info(f"Found {len(photo_files)} photos to process")
            
            # Process each guest
            for guest_folder in self.selfies_dir.iterdir():
                if not guest_folder.is_dir():
                    continue
                    
                guest_email = guest_folder.name
                logging.info(f"Processing guest: {guest_email}")
                
                try:
                    # Create matched directory for this guest
                    guest_matched_dir = self.matched_dir / guest_email
                    guest_matched_dir.mkdir(exist_ok=True)
                    
                    # Get all valid selfies for the guest
                    selfie_files = []
                    for f in guest_folder.iterdir():
                        if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                            try:
                                # Verify the file is a valid image
                                with Image.open(f) as img:
                                    img.verify()
                                selfie_files.append(f)
                                logging.info(f"Valid selfie found: {f}")
                            except Exception as e:
                                logging.warning(f"Invalid or corrupted image file {f}: {str(e)}")
                        
                    if not selfie_files:
                        logging.warning(f"No valid selfies found for guest {guest_email}")
                        continue
                        
                    self.stats['valid_selfies'] += len(selfie_files)
                    logging.info(f"Found {len(selfie_files)} valid selfies for guest {guest_email}")
                    
                    # Create temporary directory for selfie processing
                    with tempfile.TemporaryDirectory() as temp_dir:
                        # Copy all selfies to temp directory
                        temp_selfies = []
                        for i, selfie in enumerate(selfie_files):
                            temp_path = os.path.join(temp_dir, f"ref_{i}.jpg")
                            shutil.copy2(str(selfie), temp_path)
                            temp_selfies.append(temp_path)
                        
                        # Process each photo
                        for photo in photo_files:
                            best_match = False
                            
                            try:
                                # Try each selfie
                                # Try each selfie and attempt multiple detector backends/fallbacks if verification fails
                                for temp_selfie in temp_selfies:
                                    tried_result = None
                                    tried_exception = None
                                    used_backend = None
                                    backends_to_try = [self.detector_backend, 'retinaface', 'mtcnn', 'opencv']
                                    # Ensure uniqueness while preserving preference
                                    seen = set()
                                    backends = []
                                    for b in backends_to_try:
                                        if b not in seen:
                                            seen.add(b)
                                            backends.append(b)

                                    for backend in backends:
                                        try:
                                            logging.debug(f"Trying DeepFace.verify with backend={backend} for photo={photo.name} vs selfie={temp_selfie}")
                                            # First attempt with enforce_detection=True which is more strict but gives better embeddings
                                            tried_result = DeepFace.verify(
                                                img1_path=str(photo),
                                                img2_path=temp_selfie,
                                                detector_backend=backend,
                                                model_name=self.model_name,
                                                distance_metric="cosine",
                                                enforce_detection=True
                                            )
                                            used_backend = backend
                                            logging.info(f"DeepFace.verify succeeded with backend={backend} for {photo.name}")
                                            break
                                        except Exception as e:
                                            # Record and try fallback; if strict detection fails try relaxed detection as last resort
                                            tried_exception = e
                                            logging.debug(f"DeepFace.verify failed with backend={backend} (enforce_detection=True): {e}")
                                            continue

                                    # If all backends with enforce_detection=True failed, try a relaxed pass with enforce_detection=False
                                    if tried_result is None:
                                        for backend in backends:
                                            try:
                                                logging.debug(f"Trying relaxed DeepFace.verify with backend={backend} (enforce_detection=False) for {photo.name}")
                                                tried_result = DeepFace.verify(
                                                    img1_path=str(photo),
                                                    img2_path=temp_selfie,
                                                    detector_backend=backend,
                                                    model_name=self.model_name,
                                                    distance_metric="cosine",
                                                    enforce_detection=False
                                                )
                                                used_backend = backend
                                                logging.info(f"DeepFace.verify (relaxed) succeeded with backend={backend} for {photo.name}")
                                                break
                                            except Exception as e:
                                                tried_exception = e
                                                logging.debug(f"Relaxed DeepFace.verify failed with backend={backend}: {e}")
                                                continue

                                    if tried_result is None:
                                        logging.warning(f"All DeepFace.verify attempts failed for {photo.name} vs {temp_selfie}: last error={tried_exception}")
                                        continue

                                    # Extract distance (some DeepFace builds might return different keys)
                                    distance = None
                                    if isinstance(tried_result, dict):
                                        distance = tried_result.get('distance')
                                    # Guard: if no distance available, skip
                                    if distance is None:
                                        logging.warning(f"No distance returned by DeepFace.verify for {photo.name} vs {temp_selfie}. Result: {tried_result}")
                                        continue

                                    similarity = 1.0 - float(distance)
                                    logging.info(f"Verification result for {photo.name} vs {os.path.basename(temp_selfie)} - backend={used_backend if used_backend else 'unknown'}: distance={distance:.4f}, similarity={similarity:.4f}")

                                    if similarity >= self.similarity_threshold:
                                        dest_path = guest_matched_dir / photo.name
                                        if not dest_path.exists():
                                            shutil.copy2(str(photo), str(dest_path))
                                            total_matches += 1
                                            logging.info(f"\u2705 Photo {photo.name} matched to {guest_email} (similarity: {similarity:.4f}, backend used={used_backend if used_backend else 'unknown'})")
                                        else:
                                            logging.debug(f"Photo {photo.name} already exists in {guest_email} folder")
                                        best_match = True
                                        # Do not break out of the photo loop here; continue checking other selfies for same guest
                                        # break
                                        
                                if not best_match:
                                    logging.info(f"No match found for {photo.name}")
                                    
                            except Exception as e:
                                logging.warning(f"Error processing photo {photo.name}: {str(e)}")
                                continue
                                
                except Exception as e:
                    logging.error(f"Error processing guest {guest_email}: {str(e)}")
                    continue

            self.stats['total_matches'] = total_matches
            return total_matches
            
        except Exception as e:
            logging.error(f"Error during event photo processing: {str(e)}")
            return 0

    def generate_processing_report(self):
        """Generate a processing report"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'event_path': str(self.event_path),
            'statistics': self.stats,
            'configuration': {
                'similarity_threshold': self.similarity_threshold,
                'detector_backend': self.detector_backend,
                'model_name': self.model_name
            },
            'success': True
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
        logging.info(f"Configuration: detector={self.detector_backend}, model={self.model_name}, threshold={self.similarity_threshold}")

        try:
            # Process event photos
            total_matches = self.process_event_photos()
            if total_matches == 0:
                logging.error("No matches found during processing")
                # return False # Allow to complete even with no matches

            # Calculate processing time
            end_time = datetime.now()
            self.stats['processing_time'] = int((end_time - start_time).total_seconds())

            # Generate report
            self.generate_processing_report()

            # Final statistics
            logging.info("PROCESSING COMPLETE!")
            logging.info(f"📊 STATISTICS:")
            logging.info(f"  📸 Total selfies: {self.stats['total_selfies']}")
            logging.info(f"  ✅ Valid selfies: {self.stats['valid_selfies']}")
            logging.info(f"  📷 Total photos: {self.stats['total_photos']}")
            logging.info(f"  🎯 Photos matched: {self.stats['total_matches']}")
            # Note: Guest count is not tracked accurately in the original code, setting to 0 or calculating separately
            logging.info(f"  👥 Guests processed: {self.stats['guests_processed']}") 
            logging.info(f"  ⏱️ Processing time: {self.stats['processing_time']:.2f} seconds")
            
            # Additional match quality information
            if self.stats['total_photos'] > 0 and self.stats['processing_time'] > 0:
                logging.info(f"🎯 Match details:")
                logging.info(f"  - Average processing time per photo: {self.stats['processing_time'] / self.stats['total_photos']:.2f} seconds")
                logging.info(f"  - Photos per second: {self.stats['total_photos'] / self.stats['processing_time']:.2f}")
                logging.info(f"  - Match success rate: {(self.stats['total_matches'] / self.stats['total_photos'] * 100):.1f}%")
            
            return True

        except Exception as e:
            logging.error(f"Unexpected error during processing: {str(e)}")
            return False

def test_find_and_visualize(processor: DeepFaceProcessor):
    """
    Function to directly replicate the Colab logic using the new visualization method.
    This is for testing the Colab-converted part of the code.
    """
    logging.info("\n--- DEMO: CONVERTED COLAB FIND/VISUALIZATION LOGIC ---")
    
    # --- DEMO SETUP: Replace Colab paths with local paths for testing ---
    # NOTE: You must prepare your local file system for this to run:
    # 1. Place a query image at TEST_SELDIE_DIR / "suriya1.jpg"
    # 2. Place some reference images with faces in TEST_DB_DIR (DeepFace will build the DB)
    
    Path(TEST_SELDIE_DIR).mkdir(parents=True, exist_ok=True)
    Path(TEST_DB_DIR).mkdir(parents=True, exist_ok=True)
    Path(TEST_PROCESSED_FIND_DIR).mkdir(parents=True, exist_ok=True)
    
    img_path = str(TEST_SELDIE_DIR / "suriya1.jpg") 
    db_path = str(TEST_DB_DIR) 

    if not Path(img_path).exists():
         logging.error(f"TEST FAILED: Query image not found at {img_path}. Please place an image there.")
         logging.error("Skipping Colab Find Demo...")
         return

    logging.info(f"Querying: {img_path}")
    logging.info(f"Database: {db_path}")

    # DeepFace.find() call from Colab, using the exact parameters:
    try:
        # NOTE: Using 'Facenet512', 'opencv', and 'angular' as requested in the Colab code
        dfs = DeepFace.find(
            img_path=img_path, 
            db_path=db_path, 
            model_name="Facenet512",
            detector_backend="opencv",
            distance_metric="angular",
            enforce_detection=False # Safer for testing environments
        )
        print("DeepFace.find() results (list of DataFrames):", dfs)
        
        # Call the new visualization method
        processor.visualize_deepface_find_results(dfs, TEST_PROCESSED_FIND_DIR)

    except Exception as e:
        logging.error(f"Error during DeepFace.find() or visualization: {e}")
        
    logging.info("--- DEMO COMPLETE ---")
    cv2.destroyAllWindows() # Close any open windows

def main():
    """Main entry point"""
    # Use a fixed path for demonstration purposes if run without args
    if len(sys.argv) < 2:
        event_path = str(TEST_DIR) # Default to 'test_event_data' folder
        logging.info(f"No event path provided, defaulting to: {event_path}")
    else:
        event_path = sys.argv[1]
    
    # Safely parse similarity threshold
    similarity_threshold = 0.4  # default value (lowered for better matching)
    if len(sys.argv) > 2:
        try:
            val = float(sys.argv[2])
            if 0.0 <= val <= 1.0:
                similarity_threshold = val
            else:
                logging.warning(f"Invalid similarity threshold {val}, using default: {similarity_threshold}")
        except (ValueError, TypeError):
            logging.warning(f"Could not parse similarity threshold '{sys.argv[2]}', using default: {similarity_threshold}")
    
    processor = DeepFaceProcessor(
        event_path=event_path,
        similarity_threshold=similarity_threshold
    )

    try:
        # Run the actual face matching process
        logging.info("\n--- STARTING BATCH VERIFICATION PROCESS ---")
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
        logging.error(f"Fatal error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()