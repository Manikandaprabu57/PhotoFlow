import face_recognition
import os
import shutil

# Paths
SELFIE_DIR = r"D:\Projects\backend project 1\selfies"
EVENT_DIR = r"D:\Projects\backend project 1\photos\Nivetha Akka"
OUTPUT_DIR = r"D:\Projects\backend project 1\matched_faces"

# Create output directory
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Load selfie encodings
selfie_encodings = []
selfie_names = []

print("🔍 Loading selfie faces...")
for file in os.listdir(SELFIE_DIR):
    if file.lower().endswith((".jpg", ".jpeg", ".png")):
        path = os.path.join(SELFIE_DIR, file)
        img = face_recognition.load_image_file(path)
        encodings = face_recognition.face_encodings(img)
        if encodings:
            selfie_encodings.append(encodings[0])
            selfie_names.append(os.path.splitext(file)[0])
            print(f"  ✅ Loaded {file}")
        else:
            print(f"  ⚠ No face found in {file}")

print(f"Loaded {len(selfie_encodings)} selfie faces.")

# Match with event photos
print("\n📸 Processing event photos...")
for event_file in os.listdir(EVENT_DIR):
    if event_file.lower().endswith((".jpg", ".jpeg", ".png")):
        event_path = os.path.join(EVENT_DIR, event_file)

        # Load and find faces
        event_img = face_recognition.load_image_file(event_path)
        event_encodings = face_recognition.face_encodings(event_img)

        matched = False
        for face_encoding in event_encodings:
            # Compare with each selfie
            distances = face_recognition.face_distance(selfie_encodings, face_encoding)
            min_dist = min(distances)

            if min_dist < 0.5:  # 🔹 Lower = stricter match
                person_index = distances.tolist().index(min_dist)
                person_name = selfie_names[person_index]

                # Save to person's folder
                person_folder = os.path.join(OUTPUT_DIR, person_name)
                os.makedirs(person_folder, exist_ok=True)

                shutil.copy(event_path, os.path.join(person_folder, event_file))
                print(f"  ✅ Matched {person_name} in {event_file} (distance: {min_dist:.2f})")
                matched = True
                break  # Stop after first match for this image

        if not matched:
            print(f"  ❌ No match in {event_file}")
