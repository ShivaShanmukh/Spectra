"""
show_blobs.py
Save 3 frames around 8-9 seconds with every white blob numbered.
You look at the image and tell me: "the ball is blob #N"
That way we know exactly what to track.

Run:
  python show_blobs.py --video "C:/Users/Superman/Downloads/test.mp4"
"""

import argparse
import cv2
import numpy as np

WHITE_LOWER = np.array([0,   0,   170])
WHITE_UPPER = np.array([180, 55,  255])

MIN_RADIUS = 4
MAX_RADIUS = 22

MIN_CIRCULARITY = 0.55


def get_blobs(frame):
    hsv  = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, WHITE_LOWER, WHITE_UPPER)
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.erode(mask, kernel, iterations=1)
    mask = cv2.dilate(mask, kernel, iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blobs = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 8:
            continue
        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        if not (MIN_RADIUS <= r <= MAX_RADIUS):
            continue
        p = cv2.arcLength(cnt, True)
        if p == 0:
            continue
        circ = (4 * np.pi * area) / (p ** 2)
        if circ < MIN_CIRCULARITY:
            continue
        blobs.append((int(cx), int(cy), round(r, 1)))
    return blobs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS)

    # Sample frames at 8.0s, 8.5s, 9.0s
    target_times = [8.0, 8.3, 8.6, 9.0]
    target_frames = [int(t * fps) for t in target_times]

    import os
    os.makedirs("ball_confirm", exist_ok=True)

    for fn, t in zip(target_frames, target_times):
        cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
        ret, frame = cap.read()
        if not ret:
            continue

        blobs = get_blobs(frame)

        # Draw each blob with a number
        print(f"\nFrame {fn} (t={t:.1f}s) — {len(blobs)} blob(s):")
        for i, (cx, cy, r) in enumerate(blobs):
            color = (0, 200, 255)  # yellow-ish
            cv2.circle(frame, (cx, cy), int(r) + 3, color, 1)
            cv2.circle(frame, (cx, cy), int(r),     color, 2)
            cv2.circle(frame, (cx, cy), 3,          color, -1)
            label = str(i + 1)
            cv2.putText(frame, label, (cx + 6, cy - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            print(f"  #{i+1:>2}  pos=({cx:>3},{cy:>3})  r={r}")

        cv2.putText(frame, f"t={t:.1f}s  frame {fn}", (8, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

        path = f"ball_confirm/blobs_{fn:04d}_{t:.1f}s.jpg"
        cv2.imwrite(path, frame)
        print(f"  -> Saved {path}")

    cap.release()
    print("\nOpen the ball_confirm/ folder.")
    print("Look at the images and tell me: which NUMBER is on the cricket ball?")


if __name__ == "__main__":
    main()
