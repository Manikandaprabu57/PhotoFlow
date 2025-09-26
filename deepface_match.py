import os
import sys
import shutil
import json
import logging
from pathlib import Path
from datetime import datetime
from deepface import DeepFace
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('face_processing.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

class DeepFaceProcessor:
    def __init__(self, event_path, similarity_threshold=0.3, detector_backend="mtcnn"):
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
        self.model_name = "VGG-Face"  # Using VGG-Face for better accuracy
        
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
                    if file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                        selfie_count += 1
                        folder_files.append(file.name)
                logging.info(f"Guest {guest_folder.name}: {len(folder_files)} files - {folder_files}")

        photo_files = [f for f in self.photos_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png']]

        logging.info(f"Found {len(guest_folders)} guest folders: {guest_folders}")
        logging.info(f"Found {selfie_count} total selfie files")
        logging.info(f"Found {len(photo_files)} photo files")

        if selfie_count == 0:
            logging.warning(f"WARNING: No selfie files found in: {self.selfies_dir}")
            return False

        if not photo_files:
            logging.error(f"ERROR: No photo files found in: {self.photos_dir}")
            return False

        self.stats['total_selfies'] = selfie_count
        self.stats['total_photos'] = len(photo_files)
        return True

    def process_event_photos(self):
        """Process event photos and match with guest selfies"""
        total_matches = 0
        photo_files = [f for f in self.photos_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png']]
        
        # Process each guest's selfies
        for guest_folder in self.selfies_dir.iterdir():
            if not guest_folder.is_dir():
                continue
                
            guest_email = guest_folder.name
            logging.info(f"Processing guest: {guest_email}")
            
            # Get first valid selfie for the guest
            selfie_files = []
            for f in guest_folder.iterdir():
                if f.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                    try:
                        # Verify the file is a valid image by trying to open it
                        from PIL import Image
                        with Image.open(f) as img:
                            img.verify()
                        selfie_files.append(f)
                        logging.info(f"Valid selfie found: {f}")
                    except Exception as e:
                        logging.warning(f"Invalid or corrupted image file {f}: {str(e)}")

            if not selfie_files:
                logging.warning(f"No valid selfies found for guest {guest_email}")
                continue
                
            reference_selfie = str(selfie_files[0])
            if not os.path.isfile(reference_selfie):
                logging.warning(f"Reference selfie not accessible: {reference_selfie}")
                continue

            self.stats['valid_selfies'] += 1
            logging.info(f"Using reference selfie: {reference_selfie}")
            
            # Create matched directory for this guest
            guest_matched_dir = self.matched_dir / guest_email
            guest_matched_dir.mkdir(exist_ok=True)
            
            # Process each event photo
            for photo_file in photo_files:
                try:
                    # Verify files exist and are accessible
                    if not os.path.isfile(str(photo_file)):
                        logging.warning(f"Photo file not found: {photo_file}")
                        continue
                    if not os.path.isfile(str(reference_selfie)):
                        logging.warning(f"Reference selfie not found: {reference_selfie}")
                        continue

                    # Create a temporary directory for the database
                    import tempfile
                    with tempfile.TemporaryDirectory() as temp_dir:
                        # Copy reference selfie to temp dir with a simple name
                        temp_selfie = os.path.join(temp_dir, "reference.jpg")
                        shutil.copy2(reference_selfie, temp_selfie)
                        
                        logging.info(f"Comparing photo {photo_file.name} with selfie using {self.detector_backend} detector")
                        
                        # Use DeepFace to find faces in the event photo
                        # First verify we can detect faces in both images
                        try:
                            photo_faces = DeepFace.extract_faces(
                                img_path=str(photo_file),
                                detector_backend=self.detector_backend,
                                enforce_detection=False
                            )
                            selfie_faces = DeepFace.extract_faces(
                                img_path=temp_selfie,
                                detector_backend=self.detector_backend,
                                enforce_detection=False
                            )
                            
                            if not photo_faces or not selfie_faces:
                                logging.warning(f"No faces detected in {'photo' if not photo_faces else 'selfie'}")
                                continue
                                
                            logging.info(f"Found {len(photo_faces)} faces in photo and {len(selfie_faces)} faces in selfie")
                            
                            # Log confidence scores for detected faces
                            for i, face in enumerate(photo_faces):
                                confidence = face.get('confidence', 'N/A')
                                logging.info(f"Photo face #{i+1} confidence: {confidence}")
                            for i, face in enumerate(selfie_faces):
                                confidence = face.get('confidence', 'N/A')
                                logging.info(f"Selfie face #{i+1} confidence: {confidence}")
                            
                        except Exception as e:
                            logging.warning(f"Error detecting faces: {str(e)}")
                            continue
                            
                        # Try direct verification first
                        try:
                            verification = DeepFace.verify(
                                img1_path=str(photo_file),
                                img2_path=temp_selfie,
                                detector_backend=self.detector_backend,
                                model_name=self.model_name,
                                distance_metric="cosine",
                                enforce_detection=False
                            )
                            
                            distance = verification.get("distance", 1.0)
                            verified = verification.get("verified", False)
                            similarity = 1.0 - distance
                            
                            logging.info(f"Direct verification result - Distance: {distance:.3f}, Similarity: {similarity:.3f}, Verified: {verified}")
                            
                            if verified or similarity >= self.similarity_threshold:
                                # Copy matched photo to guest's directory
                                dest_path = guest_matched_dir / photo_file.name
                                if not dest_path.exists():  # Avoid duplicates
                                    shutil.copy2(photo_file, dest_path)
                                    total_matches += 1
                                    logging.info(f"✅ Direct match found! Photo {photo_file.name} matched to {guest_email} (similarity: {similarity:.3f})")
                                continue  # Skip find operation if we already found a match
                                
                        except Exception as e:
                            logging.warning(f"Direct verification failed, falling back to find: {str(e)}")
                        
                        # Fall back to DeepFace.find for multiple face scenarios
                        result = DeepFace.find(
                            img_path=str(photo_file),
                            db_path=temp_dir,  # Use temp dir as database path
                            detector_backend=self.detector_backend,
                            model_name=self.model_name,
                            enforce_detection=False,
                            silent=True
                        )
                    
                    # Check if any faces match
                    if result and isinstance(result, list) and len(result) > 0:
                        matches = result[0]
                        logging.info(f"Find operation returned {len(matches) if isinstance(matches, list) else 1} potential matches")
                        if isinstance(matches, (list, dict)) and (isinstance(matches, list) and len(matches) > 0 or isinstance(matches, dict)):
                            # Handle both list and dictionary result formats
                            if isinstance(matches, list):
                                best_match = matches[0]
                            else:
                                best_match = matches
                                
                            # Get cosine distance, defaulting to 1.0 if not found
                            cosine_distance = 1.0
                            if isinstance(best_match, dict):
                                # Try different possible keys for cosine distance
                                distance_keys = ["VGG-Face_cosine", "distance", "cosine"]
                                for key in distance_keys:
                                    if key in best_match:
                                        cosine_distance = float(best_match[key])
                                        break
                            elif hasattr(best_match, "VGG-Face_cosine"):
                                cosine_distance = float(getattr(best_match, "VGG-Face_cosine"))
                            
                            # Ensure distance is valid
                            if not 0 <= cosine_distance <= 1:
                                cosine_distance = 1.0
                                
                            # Convert distance to similarity (1 - distance)
                            similarity = 1.0 - cosine_distance
                            logging.debug(f"Raw cosine distance: {cosine_distance}, Calculated similarity: {similarity}")
                            
                            logging.info(f"Match score for {photo_file.name}: {similarity:.3f} (threshold: {self.similarity_threshold})")
                            
                            if similarity >= self.similarity_threshold:
                                try:
                                    # Verify match using DeepFace.verify
                                    verification = DeepFace.verify(
                                        img1_path=str(photo_file),
                                        img2_path=temp_selfie,
                                        detector_backend=self.detector_backend,
                                        model_name=self.model_name,
                                        enforce_detection=False
                                    )
                                    
                                    if verification.get("verified", False):
                                        # Copy matched photo to guest's directory
                                        dest_path = guest_matched_dir / photo_file.name
                                        if not dest_path.exists():  # Avoid duplicates
                                            shutil.copy2(photo_file, dest_path)
                                            total_matches += 1
                                            logging.info(f"Matched and verified {photo_file.name} to {guest_email} (similarity: {similarity:.3f})")
                                    else:
                                        logging.info(f"Match rejected by verification for {photo_file.name} (similarity was {similarity:.3f})")
                                
                                except Exception as e:
                                    logging.warning(f"Verification failed for {photo_file.name}: {str(e)}")
                                    continue
                
                except Exception as e:
                    logging.warning(f"Error processing {photo_file.name}: {str(e)}")
                    continue

        self.stats['total_matches'] = total_matches
        self.stats['guests_processed'] = sum(1 for _ in self.selfies_dir.iterdir() if _.is_dir())
        return total_matches

    def create_export_zip(self, guest_email):
        """Create a zip file containing matched photos for a guest"""
        try:
            guest_matched_dir = self.matched_dir / guest_email
            if not guest_matched_dir.exists() or not guest_matched_dir.is_dir():
                logging.warning(f"No matched photos directory found for {guest_email}")
                return None
                
            matched_photos = list(guest_matched_dir.iterdir())
            if not matched_photos:
                logging.warning(f"No matched photos found for {guest_email}")
                return None
                
            # Create zip file
            zip_path = self.exports_dir / f"{guest_email}.zip"
            if zip_path.exists():
                zip_path.unlink()  # Remove existing zip file
                
            shutil.make_archive(
                str(zip_path.with_suffix('')),  # Path without .zip extension
                'zip',
                str(guest_matched_dir)  # Source directory to zip
            )
            
            logging.info(f"Created zip file for {guest_email} with {len(matched_photos)} photos")
            return zip_path
            
        except Exception as e:
            logging.error(f"Error creating zip for {guest_email}: {str(e)}")
            return None

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
            # Validate directories
            if not self.validate_directories():
                logging.error("Directory validation failed. Exiting.")
                return False

            # Process event photos
            total_matches = self.process_event_photos()
            if total_matches == 0:
                logging.warning("No matches found during processing")
            
            # Create zip files for each guest with matches
            zip_files_created = 0
            for guest_folder in self.matched_dir.iterdir():
                if guest_folder.is_dir():
                    guest_email = guest_folder.name
                    if list(guest_folder.iterdir()):  # Check if there are any matched photos
                        if zip_path := self.create_export_zip(guest_email):
                            zip_files_created += 1

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
            logging.info(f"  👥 Guests processed: {self.stats['guests_processed']}")
            logging.info(f"  📦 Zip files created: {zip_files_created}")
            logging.info(f"  ⏱️ Processing time: {self.stats['processing_time']:.2f} seconds")
            
            # Additional match quality information
            if self.stats['total_matches'] > 0:
                logging.info(f"🎯 Match details:")
                logging.info(f"  - Average processing time per photo: {self.stats['processing_time'] / self.stats['total_photos']:.2f} seconds")
                logging.info(f"  - Photos per second: {self.stats['total_photos'] / self.stats['processing_time']:.2f}")
                logging.info(f"  - Match success rate: {(self.stats['total_matches'] / self.stats['total_photos'] * 100):.1f}%")

            return True

        except Exception as e:
            logging.error(f"Unexpected error during processing: {str(e)}")
            return False

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python deepface_match.py <event_path> [similarity_threshold]")
        sys.exit(1)

    event_path = sys.argv[1]
    
    # Safely parse similarity threshold
    similarity_threshold = 0.6  # default value
    if len(sys.argv) > 2:
        try:
            val = float(sys.argv[2])
            if 0.0 <= val <= 1.0:  # ensure value is in valid range
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