"""
frame_test.py
Extract a single frame from a real video and run YOLOv8 on it.
This tells us whether the model can spot the ball in YOUR footage
before we process the whole video.
"""

import argparse
import sys
import cv2
from ultralytics import YOLO

# ── Step 1: Read the video path from the command line ──────────────────────
# argparse lets us pass --video path/to/file.mp4 when running the script.
parser = argparse.ArgumentParser(description="Detect ball in one video frame")
parser.add_argument("--video",  required=True,  help="Path to your MP4 video file")
parser.add_argument("--frame",  type=int, default=100, help="Which frame to extract (default: 100)")
parser.add_argument("--conf",   type=float, default=0.3, help="Confidence threshold (default: 0.3)")
args = parser.parse_args()

# ── Step 2: Open the video file ────────────────────────────────────────────
# cv2.VideoCapture opens a video so we can read it frame by frame.
cap = cv2.VideoCapture(args.video)

if not cap.isOpened():
    print(f"ERROR: Could not open video: {args.video}")
    print("Check the path is correct and the file is a valid MP4.")
    sys.exit(1)

# Print basic info about the video so we know what we're working with.
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps          = cap.get(cv2.CAP_PROP_FPS)
width        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

print(f"\nVideo info:")
print(f"  File        : {args.video}")
print(f"  Resolution  : {width} x {height}")
print(f"  FPS         : {fps:.1f}")
print(f"  Total frames: {total_frames}")
print(f"  Duration    : {total_frames / fps:.1f} seconds")

# ── Step 3: Jump to the frame we want ─────────────────────────────────────
# CAP_PROP_POS_FRAMES tells OpenCV to skip to a specific frame number
# instead of reading every frame from the start.
target_frame = min(args.frame, total_frames - 1)  # don't go past the end
cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)

# ret = True if the read succeeded, frame = the actual image as a numpy array.
ret, frame = cap.read()
cap.release()  # done with the video file, close it

if not ret:
    print(f"ERROR: Could not read frame {target_frame}.")
    sys.exit(1)

print(f"\nExtracted frame {target_frame}")

# Save the raw frame before detection so you can compare before/after.
cv2.imwrite("frame_raw.jpg", frame)
print("Saved raw frame to frame_raw.jpg")

# ── Step 4: Load the model and run detection ───────────────────────────────
# conf=args.conf means "only show detections above this confidence level".
# Lower = catches more things (including wrong ones).
# Higher = only shows confident detections.
print(f"\nRunning YOLOv8 detection (confidence threshold: {args.conf})...")
model   = YOLO("yolov8n.pt")
results = model(frame, conf=args.conf)
result  = results[0]

# ── Step 5: Print everything that was detected ─────────────────────────────
print(f"\n{'─'*50}")
if len(result.boxes) == 0:
    print("Nothing detected above the confidence threshold.")
    print(f"Try lowering --conf (e.g. --conf 0.1) to see weaker detections.")
else:
    print(f"Found {len(result.boxes)} object(s):\n")

    for box in result.boxes:
        class_id   = int(box.cls[0])
        label      = model.names[class_id]
        confidence = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        center_x   = (x1 + x2) / 2
        center_y   = (y1 + y2) / 2
        box_width  = x2 - x1
        box_height = y2 - y1

        # Flag the label if it's ball-related so it's easy to spot
        is_ball = "sports ball" in label.lower()
        marker  = "  ← BALL" if is_ball else ""

        print(f"  {label}{marker}")
        print(f"    confidence  : {confidence:.2f}  ({int(confidence*100)}%)")
        print(f"    center      : ({int(center_x)}, {int(center_y)})")
        print(f"    box size    : {int(box_width)} x {int(box_height)} pixels")
        print()

print(f"{'─'*50}")

# ── Step 6: Save the annotated frame ──────────────────────────────────────
# result.plot() draws boxes + labels directly onto the frame image.
output_path = f"frame_{target_frame}.jpg"
annotated = result.plot()
cv2.imwrite(output_path, annotated)
print(f"\nSaved annotated frame to {output_path}")
print("Open it to see exactly what the model detected.")
print("\nWhat to look for:")
print("  ✓ Green box around the ball = detected correctly")
print("  ✗ No box on the ball        = model missed it (try --conf 0.1)")
print("  ✗ Box on wrong thing        = false positive (raise --conf)")
