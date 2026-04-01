"""
test_detection.py
Run YOLOv8 on a single image to confirm the model works
before we touch any video files.
"""

from ultralytics import YOLO
import cv2

# ── Step 1: Download the model ─────────────────────────────────────────────
# "yolov8n" means YOLOv8 Nano — the smallest, fastest version.
# The first time you run this it downloads ~6MB from the internet.
# After that it's cached locally and loads instantly.
model = YOLO("yolov8n.pt")

# ── Step 2: Create a test image with a bright ball drawn on it ──────────────
# We draw a yellow circle on a green background — roughly what a tennis/cricket
# ball looks like from above on a pitch. This avoids any network issues.
import numpy as np

image_path = "test_image.jpg"
print("Creating test image...")

# numpy creates a 480x640 green background (height, width, 3 colour channels)
img = np.zeros((480, 640, 3), dtype=np.uint8)
img[:] = (34, 139, 34)  # fill with green (BGR format: Blue=34, Green=139, Red=34)

# Draw a yellow circle to represent a ball (centre x=320 y=240, radius=40)
cv2.circle(img, center=(320, 240), radius=40, color=(0, 255, 255), thickness=-1)

# Draw a thin red seam line across the ball like a cricket ball
cv2.ellipse(img, (320, 240), (40, 15), 0, 0, 360, (0, 0, 200), 2)

cv2.imwrite(image_path, img)
print(f"Saved to {image_path}")

# ── Step 3: Run detection ───────────────────────────────────────────────────
# This is where the AI actually looks at the image.
# It returns a list of results — one result per image we gave it.
print("\nRunning detection...")
results = model(image_path)

# ── Step 4: Print what was found ────────────────────────────────────────────
# results[0] is the result for our single image.
# .boxes contains every object the model spotted.
result = results[0]

if len(result.boxes) == 0:
    print("Nothing detected — try a clearer image.")
else:
    print(f"\nFound {len(result.boxes)} object(s):\n")
    for box in result.boxes:
        # The class ID is a number — model.names turns it into a word like "sports ball"
        class_id   = int(box.cls[0])
        label      = model.names[class_id]

        # Confidence is a 0.0–1.0 score: 1.0 = model is certain, 0.0 = total guess
        confidence = float(box.conf[0])

        # xyxy gives us the box corners: left, top, right, bottom (in pixels)
        x1, y1, x2, y2 = box.xyxy[0].tolist()

        # The center of the box is the average of the two corners
        center_x = (x1 + x2) / 2
        center_y = (y1 + y2) / 2

        print(f"  Found: {label}")
        print(f"    confidence = {confidence:.2f}")
        print(f"    box corners: ({int(x1)}, {int(y1)}) → ({int(x2)}, {int(y2)})")
        print(f"    center point: ({int(center_x)}, {int(center_y)})\n")

# ── Step 5: Save the image with boxes drawn ─────────────────────────────────
# result.plot() draws coloured boxes + labels on the image and returns it.
annotated = result.plot()

# cv2.imwrite saves the annotated image to disk so you can open it and look at it.
cv2.imwrite("output.jpg", annotated)
print("Saved annotated image to output.jpg")
print("Open it to see the detection boxes drawn on the image.")
