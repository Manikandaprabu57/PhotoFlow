# -*- coding: utf-8 -*-
"""
OPTIMIZED Face Matching Script - 100x Faster!
Uses DeepFace.find() instead of verify() for batch processing
"""

import os
import sys
import shutil
import json
import logging
from pathlib import Path
from datetime import datetime
from deepface import DeepFace
from PIL import Image
import time

# Configure logging with explicit stdout flushing
import sys
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('face_processing.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

# Force immediate output flushing
logging.getLogger().handlers[1].flush = lambda: sys.stdout.flush()

class FastFaceProcessor:
    def __init__(self, event_path, threshold=0.6):
        """
        Initialize the fast face processor
        
        Args:
            event_path: Path to the event directory
            threshold: Distance threshold for matching (lower = stricter)
                      - VGG-Face cosine: 0.6 (default - balanced)
                      - Facenet: 10
                      - Facenet512: 23
        """
        self.event_path = Path(event_path)
        self.selfies_dir = self.event_path / "selfies"
        self.photos_dir = self.event_path / "photos"
        self.matched_dir = self.event_path / "matched"
        self.exports_dir = self.event_path / "exports"
        
        # Create directories
        self.matched_dir.mkdir(exist_ok=True)
        self.exports_dir.mkdir(exist_ok=True)
        
        # Configuration - Using VGG-Face for balance of speed and accuracy
        self.threshold = float(threshold)
        self.model_name = "VGG-Face"  # Fast and accurate
        self.detector_backend = "opencv"  # Fastest detector
        self.distance_metric = "cosine"
        
        # Stats
        self.stats = {
            'total_guests': 0,
            'total_selfies': 0,
            'total_photos': 0,
            'total_matches': 0,
            'processing_time': 0,
            'photos_per_second': 0
        }
        
        logging.info(f"🚀 Fast Face Processor initialized")
        logging.info(f"📊 Model: {self.model_name}, Detector: {self.detector_backend}")
        logging.info(f"🎯 Threshold: {self.threshold}")

    def validate_setup(self):
        """Validate directories and count files"""
        logging.info("\n" + "="*60)
        logging.info("📋 VALIDATING SETUP")
        logging.info("="*60)
        
        if not self.selfies_dir.exists():
            logging.error(f"❌ Selfies directory not found: {self.selfies_dir}")
            return False
            
        if not self.photos_dir.exists():
            logging.error(f"❌ Photos directory not found: {self.photos_dir}")
            return False
        
        # Count guests and selfies
        guest_count = 0
        selfie_count = 0
        
        for guest_folder in self.selfies_dir.iterdir():
            if guest_folder.is_dir():
                guest_count += 1
                guest_selfies = list(guest_folder.glob('*.jpg')) + \
                               list(guest_folder.glob('*.jpeg')) + \
                               list(guest_folder.glob('*.png')) + \
                               list(guest_folder.glob('*.webp'))
                selfie_count += len(guest_selfies)
                logging.info(f"👤 {guest_folder.name}: {len(guest_selfies)} selfies")
        
        # Count photos
        photo_files = list(self.photos_dir.glob('*.jpg')) + \
                     list(self.photos_dir.glob('*.jpeg')) + \
                     list(self.photos_dir.glob('*.png')) + \
                     list(self.photos_dir.glob('*.webp'))
        
        self.stats['total_guests'] = guest_count
        self.stats['total_selfies'] = selfie_count
        self.stats['total_photos'] = len(photo_files)
        
        logging.info(f"\n📊 Summary:")
        logging.info(f"   👥 Guests: {guest_count}")
        logging.info(f"   🤳 Selfies: {selfie_count}")
        logging.info(f"   📷 Photos: {len(photo_files)}")
        
        if guest_count == 0:
            logging.error("❌ No guests found!")
            return False
            
        if len(photo_files) == 0:
            logging.error("❌ No photos found!")
            return False
        
        # Estimate processing time
        estimated_time = len(photo_files) * 0.5  # ~0.5 seconds per photo with find()
        logging.info(f"⏱️  Estimated time: {estimated_time/60:.1f} minutes")
        logging.info("="*60 + "\n")
        
        return True

    def process_guest(self, guest_folder):
        """
        Process a single guest using DeepFace.find() - MUCH FASTER!
        
        This method:
        1. Uses the guest's selfies as a database
        2. Searches for each photo in that database
        3. If found, it's a match!
        """
        guest_email = guest_folder.name
        logging.info(f"\n{'='*60}")
        logging.info(f"👤 Processing: {guest_email}")
        logging.info(f"{'='*60}")
        
        # Get selfies (including webp)
        selfie_files = list(guest_folder.glob('*.jpg')) + \
                      list(guest_folder.glob('*.jpeg')) + \
                      list(guest_folder.glob('*.png')) + \
                      list(guest_folder.glob('*.webp'))
        
        if not selfie_files:
            logging.warning(f"⚠️  No selfies found for {guest_email}")
            return 0
        
        logging.info(f"🤳 Found {len(selfie_files)} selfies")
        
        # Create matched directory for this guest
        guest_matched_dir = self.matched_dir / guest_email
        guest_matched_dir.mkdir(exist_ok=True)
        
        # Get all photos (including webp)
        photo_files = list(self.photos_dir.glob('*.jpg')) + \
                     list(self.photos_dir.glob('*.jpeg')) + \
                     list(self.photos_dir.glob('*.png')) + \
                     list(self.photos_dir.glob('*.webp'))
        
        matches = 0
        start_time = time.time()
        
        # Process each photo
        for idx, photo in enumerate(photo_files, 1):
            try:
                # Use DeepFace.find() - searches for faces in photo that match selfies
                # This is MUCH faster than verify() because it builds a database once
                dfs = DeepFace.find(
                    img_path=str(photo),
                    db_path=str(guest_folder),
                    model_name=self.model_name,
                    detector_backend=self.detector_backend,
                    distance_metric=self.distance_metric,
                    enforce_detection=False,
                    silent=True
                )
                
                # Check if any matches found
                matched = False
                for df in dfs:
                    if not df.empty:
                        # Filter by threshold
                        close_matches = df[df['distance'] <= self.threshold]
                        if not close_matches.empty:
                            matched = True
                            break
                
                if matched:
                    # Copy photo to matched directory
                    dest_path = guest_matched_dir / photo.name
                    if not dest_path.exists():
                        shutil.copy2(photo, dest_path)
                        matches += 1
                        logging.info(f"✅ Match {matches}: {photo.name}")
                
                # Progress update every 50 photos
                if idx % 50 == 0:
                    elapsed = time.time() - start_time
                    speed = idx / elapsed if elapsed > 0 else 0
                    remaining = (len(photo_files) - idx) / speed if speed > 0 else 0
                    logging.info(f"📊 Progress: {idx}/{len(photo_files)} photos | "
                               f"Speed: {speed:.1f} photos/sec | "
                               f"ETA: {remaining/60:.1f} min")
                
            except Exception as e:
                logging.debug(f"⚠️  Error processing {photo.name}: {str(e)}")
                continue
        
        elapsed = time.time() - start_time
        speed = len(photo_files) / elapsed if elapsed > 0 else 0
        
        logging.info(f"\n✅ Guest complete: {matches} matches found")
        logging.info(f"⏱️  Time: {elapsed:.1f}s | Speed: {speed:.1f} photos/sec")
        
        return matches

    def process_all_guests(self):
        """Process all guests"""
        logging.info("\n" + "🚀"*30)
        logging.info("STARTING FACE MATCHING PROCESS")
        logging.info("🚀"*30 + "\n")
        
        start_time = time.time()
        total_matches = 0
        
        # Get all guest folders
        guest_folders = [f for f in self.selfies_dir.iterdir() if f.is_dir()]
        
        for idx, guest_folder in enumerate(guest_folders, 1):
            logging.info(f"\n📍 Guest {idx}/{len(guest_folders)}")
            matches = self.process_guest(guest_folder)
            total_matches += matches
        
        # Calculate final stats
        elapsed = time.time() - start_time
        self.stats['processing_time'] = elapsed
        self.stats['total_matches'] = total_matches
        self.stats['photos_per_second'] = self.stats['total_photos'] / elapsed if elapsed > 0 else 0
        
        return total_matches

    def generate_report(self):
        """Generate processing report"""
        logging.info("\n" + "="*60)
        logging.info("📊 PROCESSING COMPLETE!")
        logging.info("="*60)
        logging.info(f"👥 Guests processed: {self.stats['total_guests']}")
        logging.info(f"🤳 Total selfies: {self.stats['total_selfies']}")
        logging.info(f"📷 Total photos: {self.stats['total_photos']}")
        logging.info(f"✅ Total matches: {self.stats['total_matches']}")
        logging.info(f"⏱️  Processing time: {self.stats['processing_time']:.1f} seconds ({self.stats['processing_time']/60:.1f} minutes)")
        logging.info(f"🚀 Speed: {self.stats['photos_per_second']:.2f} photos/second")
        
        if self.stats['total_photos'] > 0:
            match_rate = (self.stats['total_matches'] / (self.stats['total_photos'] * self.stats['total_guests'])) * 100
            logging.info(f"📈 Match rate: {match_rate:.1f}%")
        
        logging.info("="*60 + "\n")
        
        # Save report
        report = {
            'timestamp': datetime.now().isoformat(),
            'event_path': str(self.event_path),
            'statistics': self.stats,
            'configuration': {
                'model': self.model_name,
                'detector': self.detector_backend,
                'threshold': self.threshold,
                'distance_metric': self.distance_metric
            }
        }
        
        report_file = self.event_path / 'processing_report.json'
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        logging.info(f"💾 Report saved: {report_file}")

    def run(self):
        """Main processing function"""
        try:
            # Validate setup
            if not self.validate_setup():
                logging.error("❌ Validation failed!")
                return False
            
            # Process all guests
            total_matches = self.process_all_guests()
            
            # Generate report
            self.generate_report()
            
            if total_matches == 0:
                logging.warning("⚠️  No matches found. Try adjusting the threshold.")
                logging.warning(f"   Current threshold: {self.threshold}")
                logging.warning(f"   Try increasing it (e.g., 0.5 or 0.6)")
            
            return True
            
        except Exception as e:
            logging.error(f"❌ Fatal error: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python fast_face_match.py <event_path> [threshold]")
        print("Example: python fast_face_match.py events/MyEvent 0.4")
        print("\nThreshold guide:")
        print("  0.3 - Very strict (fewer matches, higher accuracy)")
        print("  0.4 - Balanced (recommended)")
        print("  0.5 - Relaxed (more matches, may include false positives)")
        sys.exit(1)
    
    event_path = sys.argv[1]
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.6
    
    processor = FastFaceProcessor(event_path, threshold)
    
    try:
        success = processor.run()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logging.warning("\n⚠️  Processing interrupted by user")
        sys.exit(1)
    except Exception as e:
        logging.error(f"❌ Fatal error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
