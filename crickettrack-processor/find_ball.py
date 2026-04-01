"""
find_ball.py
Scan frames 230-280 for white blobs that MOVE between frames.
Static objects (scoreboard, sky) stay fixed — the ball moves.
Saves annotated frames so you can visually confirm which blob is the ball.

Run:
  python find_ball.py --video "C:/Users/Superman/Downloads/test.mp4"
"""

import argparse
import cv2
import numpy as np

# ── White ball colour range (broad) ─────────────────────────────────────────
# Very bright, low saturation = white
WHITE_LOWER = np.array([0,   0,   160])
WHITE_UPPER = np.array([180, 80,  255])

# Ball size limits
MIN_RADIUS = 4
MAX_RADIUS = 25

# How round the blob needs to be
MIN_CIRCULARITY = 0.5

# Only look at top half of frame (ball is in top half at 8-9s)
TOP_HALF_FRACTION = 0.55   # use top 55% of frame height


def get_white_blobs(frame):
    """Return list of (cx, cy, radius, circularity) for white blobs in top half."""
    h, w = frame.shape[:2]
    crop = frame[:int(h * TOP_HALF_FRACTION), :]

    hsv  = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, WHITE_LOWER, WHITE_UPPER)

    # Clean up noise
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.erode(mask, kernel, iterations=1)
    mask = cv2.dilate(mask, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    blobs = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 8:
            continue
        (cx, cy), radius = cv2.minEnclosingCircle(cnt)
        if not (MIN_RADIUS <= radius <= MAX_RADIUS):
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circ = (4 * np.pi * area) / (perimeter ** 2)
        if circ < MIN_CIRCULARITY:
            continue
        blobs.append((int(cx), int(cy), round(radius, 1), round(circ, 2)))
    return blobs


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=int, default=220, help="First frame to scan")
    parser.add_argument("--end",   type=int, default=290, help="Last frame to scan")
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"ERROR: Cannot open {args.video}")
        return

    fps   = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video: {int(cap.get(3))}x{int(cap.get(4))}  {fps:.0f}fps  {total} frames")
    print(f"Scanning frames {args.start}-{args.end}  (t={args.start/fps:.1f}s - {args.end/fps:.1f}s)\n")

    # ── Collect blobs for every frame ───────────────────────────────────────
    frame_blobs = {}   # frame_num → list of blobs

    cap.set(cv2.CAP_PROP_POS_FRAMES, args.start)
    for fn in range(args.start, min(args.end + 1, total)):
        ret, frame = cap.read()
        if not ret:
            break
        frame_blobs[fn] = get_white_blobs(frame)

    cap.release()

    # ── Find blobs that MOVED at least 8px from previous frame ──────────────
    print("Blobs that moved 8+px between consecutive frames (likely ball):")
    print(f"  {'Frame':>6}  {'X':>5}  {'Y':>5}  {'R':>5}  {'Circ':>5}  {'Move':>6}")
    print(f"  {'':->6}  {'':->5}  {'':->5}  {'':->5}  {'':->5}  {'':->6}")

    moving_detections = []  # (frame_num, cx, cy, radius) — confirmed moving

    prev_blobs = frame_blobs.get(args.start, [])

    for fn in range(args.start + 1, min(args.end + 1, total)):
        curr_blobs = frame_blobs.get(fn, [])
        for blob in curr_blobs:
            cx, cy, r, circ = blob
            # Check if any blob in the previous frame is more than 8px away from this one
            # AND this blob moved from somewhere (i.e. something was near it before but shifted)
            matched_prev = [b for b in prev_blobs if dist((cx, cy), (b[0], b[1])) <= 35]
            if matched_prev:
                closest = min(matched_prev, key=lambda b: dist((cx, cy), (b[0], b[1])))
                movement = dist((cx, cy), (closest[0], closest[1]))
                if movement >= 8:
                    print(f"  {fn:>6}  {cx:>5}  {cy:>5}  {r:>5}  {circ:>5}  {movement:>6.1f}px")
                    moving_detections.append((fn, cx, cy, r))
        prev_blobs = curr_blobs

    if not moving_detections:
        print("  (none found — the ball may be outside the size/colour range)")
        print("\nShowing ALL white blobs instead:")
        for fn, blobs in sorted(frame_blobs.items()):
            for b in blobs:
                print(f"  frame {fn:>4}  pos=({b[0]:>3},{b[1]:>3})  r={b[2]:>5}  circ={b[3]:.2f}")
    else:
        print(f"\nFound {len(moving_detections)} moving detection(s)")

    # ── Save annotated frames for visual confirmation ────────────────────────
    print("\nSaving annotated frames to ball_confirm/ …")
    import os
    os.makedirs("ball_confirm", exist_ok=True)

    cap2 = cv2.VideoCapture(args.video)
    frames_to_save = set(fn for fn, *_ in moving_detections)

    # Also save ALL blobs in those frames so you can see everything
    for fn in sorted(frames_to_save)[:20]:   # cap at 20 images
        cap2.set(cv2.CAP_PROP_POS_FRAMES, fn)
        ret, frame = cap2.read()
        if not ret:
            continue

        # Draw all white blobs in grey
        for blob in frame_blobs.get(fn, []):
            bx, by, br, _ = blob
            cv2.circle(frame, (bx, by), int(br), (180, 180, 180), 1)

        # Draw moving blobs in bright green with label
        for (ffn, cx, cy, r) in moving_detections:
            if ffn == fn:
                cv2.circle(frame, (cx, cy), int(r) + 4, (0, 255, 255), 1)  # outer glow
                cv2.circle(frame, (cx, cy), int(r),     (0, 255, 0),   2)  # green circle
                cv2.circle(frame, (cx, cy), 3,          (0, 255, 0),  -1)  # dot
                cv2.putText(frame, f"BALL? ({cx},{cy})", (cx + 8, cy - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)

        t = fn / fps
        cv2.putText(frame, f"frame {fn}  t={t:.2f}s", (10, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        out_path = f"ball_confirm/frame_{fn:04d}.jpg"
        cv2.imwrite(out_path, frame)
        print(f"  Saved {out_path}")

    cap2.release()

    print("\nDone. Open the ball_confirm/ folder and check:")
    print("  Green circle = blob that MOVED between frames (likely the ball)")
    print("  Grey circle  = other white blobs (static objects, sky, etc.)")


if __name__ == "__main__":
    main()
