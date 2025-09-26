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

        try:
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
            photo_files = [f for f in self.photos_dir.iterdir() if f.suffix.lower() in ['.jpg', '.jpeg', '.png']]
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
                        if f.suffix.lower() in ['.jpg', '.jpeg', '.png']:
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
                                for temp_selfie in temp_selfies:
                                    try:
                                        result = DeepFace.verify(
                                            img1_path=str(photo),
                                            img2_path=temp_selfie,
                                            detector_backend=self.detector_backend,
                                            model_name=self.model_name,
                                            distance_metric="cosine",
                                            enforce_detection=False
                                        )
                                        
                                        distance = result.get("distance", 1.0)
                                        similarity = 1.0 - distance
                                        
                                        logging.info(f"Verification result - Similarity: {similarity:.3f}")
                                        
                                        if similarity >= self.similarity_threshold:
                                            dest_path = guest_matched_dir / photo.name
                                            if not dest_path.exists():
                                                shutil.copy2(str(photo), str(dest_path))
                                                total_matches += 1
                                                logging.info(f"✅ Photo {photo.name} matched to {guest_email} (similarity: {similarity:.3f})")
                                            best_match = True
                                            break
                                            
                                    except Exception as e:
                                        logging.warning(f"Verification failed: {str(e)}")
                                        continue
                                        
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
                return False

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
        logging.error(f"Fatal error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()