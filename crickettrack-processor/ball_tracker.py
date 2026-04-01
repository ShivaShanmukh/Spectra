"""
ball_tracker.py
Layer 1 — Find the cricket ball in every frame using colour tracking.

How it works:
  1. Convert each frame to HSV colour space (better for colour detection than RGB)
  2. Create a mask that highlights red OR white pixels
  3. Find all blobs (connected groups of pixels) in that mask
  4. Filter blobs by size — the ball should be small (5-30px radius)
  5. Filter by shape — the ball should be roughly circular
  6. Return the center position of the best candidate

Run it:
  python ball_tracker.py --video path/to/video.mp4
"""

import argparse
import cv2
import numpy as np


# ── Colour ranges (in HSV) ─────────────────────────────────────────────────
# HSV = Hue (colour), Saturation (intensity), Value (brightness)
# Red wraps around in HSV so we need two ranges: 0-10 AND 170-180
RED_LOWER_1  = np.array([0,   80,  80])
RED_UPPER_1  = np.array([10,  255, 255])
RED_LOWER_2  = np.array([170, 80,  80])
RED_UPPER_2  = np.array([180, 255, 255])

# White ball: any hue, very low saturation, very bright
# Calibrated for this footage (test.mp4): ball confirmed white, r=4-20
WHITE_LOWER  = np.array([0,   0,   175])
WHITE_UPPER  = np.array([180, 55,  255])

# Ball size limits in pixels (radius).
# At 360x640 a cricket ball in flight is roughly 4-20px radius.
MIN_RADIUS = 4
MAX_RADIUS = 20

# How round something needs to be to count as the ball (0=any shape, 1=perfect circle)
MIN_CIRCULARITY = 0.58

# ── Known static false-positive positions ─────────────────────────────────
# These are fixture blobs that appear every frame (stumps logo, bright spots).
# Pre-blacklisting them avoids waiting for the counter to build up.
# Each entry is (centre_x, centre_y) — anything within STATIC_IGNORE_RADIUS
# pixels of these will be ignored immediately.
STATIC_POSITIONS = [
    (229, 105),
    (206, 102),
    (234,  60),
    (316, 569),
    (234, 571),
    (260, 572),
]
STATIC_IGNORE_RADIUS = 18


def build_ball_mask(frame_hsv):
    """
    Takes an HSV frame and returns a black/white mask where
    white pixels are the ones that match red or white ball colours.
    """
    # Each inRange call produces a mask: 255 where colour matches, 0 elsewhere
    red1  = cv2.inRange(frame_hsv, RED_LOWER_1,  RED_UPPER_1)
    red2  = cv2.inRange(frame_hsv, RED_LOWER_2,  RED_UPPER_2)
    white = cv2.inRange(frame_hsv, WHITE_LOWER,  WHITE_UPPER)

    # Combine: pixel is included if it matches red (either range) OR white
    mask = cv2.bitwise_or(red1, red2)
    mask = cv2.bitwise_or(mask, white)

    # Erode removes tiny noise dots (1-2px specks that aren't the ball)
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.erode(mask, kernel, iterations=1)

    # Dilate grows what remains back to its original size (fills small holes)
    mask = cv2.dilate(mask, kernel, iterations=2)

    return mask


def _is_static_position(cx, cy):
    """Return True if (cx,cy) is within STATIC_IGNORE_RADIUS of a known static blob."""
    for sx, sy in STATIC_POSITIONS:
        if ((cx - sx) ** 2 + (cy - sy) ** 2) ** 0.5 < STATIC_IGNORE_RADIUS:
            return True
    return False


def find_blobs_in_mask(mask):
    """
    Find ALL ball-like blobs in the mask.
    Returns a list of (cx, cy, radius, confidence) — one entry per blob candidate.
    The caller decides which one to use based on trajectory context.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    results = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 10:
            continue

        (cx, cy), radius = cv2.minEnclosingCircle(contour)
        cx, cy = int(cx), int(cy)

        if not (MIN_RADIUS <= radius <= MAX_RADIUS):
            continue

        if _is_static_position(cx, cy):
            continue

        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            continue
        circularity = (4 * np.pi * area) / (perimeter ** 2)

        if circularity < MIN_CIRCULARITY:
            continue

        confidence = min(1.0, (circularity - 0.55) / 0.45)
        results.append((cx, cy, round(radius, 1), round(confidence, 2)))

    return results


def _link_tracks(frame_blobs, max_jump=45):
    """
    Link per-frame blob lists into tracks using greedy nearest-neighbour.
    Returns a list of tracks; each track is a list of (frame_num, cx, cy, r, conf).
    """
    tracks = []
    frames = sorted(frame_blobs.keys())

    # Seed tracks from first frame
    for blob in frame_blobs.get(frames[0], []):
        tracks.append([(frames[0],) + blob])

    for i in range(1, len(frames)):
        fn = frames[i]
        curr = list(frame_blobs.get(fn, []))
        used = set()

        for track in tracks:
            if not track or track[-1][0] != frames[i - 1]:
                continue   # track stalled last frame
            _, lx, ly, _, _ = track[-1]
            best_idx, best_d = None, max_jump + 1
            for j, (cx, cy, r, conf) in enumerate(curr):
                if j in used:
                    continue
                d = ((cx - lx) ** 2 + (cy - ly) ** 2) ** 0.5
                if d < best_d:
                    best_d, best_idx = d, j
            if best_idx is not None:
                track.append((fn,) + curr[best_idx])
                used.add(best_idx)

        # Start fresh tracks for unmatched blobs
        for j, blob in enumerate(curr):
            if j not in used:
                tracks.append([(fn,) + blob])

    return tracks


def _score_track(track):
    """
    Score a track by length * speed / direction_variance.
    Higher = more likely to be the ball.
    """
    if len(track) < 2:
        return 0
    vecs = [(track[k][1] - track[k-1][1], track[k][2] - track[k-1][2])
            for k in range(1, len(track))]
    avg_dx = sum(v[0] for v in vecs) / len(vecs)
    avg_dy = sum(v[1] for v in vecs) / len(vecs)
    speed  = (avg_dx ** 2 + avg_dy ** 2) ** 0.5
    var    = sum((v[0]-avg_dx)**2 + (v[1]-avg_dy)**2 for v in vecs) / len(vecs)
    return len(track) * speed / max(var ** 0.5 + 1, 1)


def track_video(video_path, output_path="tracked_output.mp4", ball_colour="red"):
    """
    Runs the ball tracker on every frame of the video.
    Two-pass approach:
      Pass 1 — collect all ball-candidate blobs in every frame.
      Trajectory linking — find the longest, most consistent blob trajectory.
      Pass 2 — write annotated output video using the winning trajectory.

    Returns a list of detections: [{ frame, x, y, radius, confidence }, ...]
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"ERROR: Could not open {video_path}")
        return []

    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS)
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"Video: {width}x{height}  {fps:.0f}fps  {total} frames  ({total/fps:.1f}s)")

    # ── Pass 1: collect blobs ─────────────────────────────────────────────────
    print("Pass 1/2 — scanning for ball-like blobs...")
    frame_blobs = {}   # frame_num -> [(cx, cy, radius, confidence), ...]
    position_counts  = {}  # for blacklisting static objects
    static_positions = list(STATIC_POSITIONS)  # start with hardcoded statics
    BLACKLIST_AFTER  = 5   # if a position appears in N frames -> static, ignore it
    BLACKLIST_RADIUS = 20

    fn = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        hsv  = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask = build_ball_mask(hsv)
        blobs = find_blobs_in_mask(mask)

        # Track how often each position appears (to auto-detect static objects)
        for (cx, cy, r, conf) in blobs:
            pos_key = (round(cx / 10) * 10, round(cy / 10) * 10)
            position_counts[pos_key] = position_counts.get(pos_key, 0) + 1
            if position_counts[pos_key] >= BLACKLIST_AFTER:
                # Auto-add to static list if not already there
                if not any(((pos_key[0]-sx)**2 + (pos_key[1]-sy)**2)**0.5 < BLACKLIST_RADIUS
                           for sx, sy in static_positions):
                    static_positions.append(pos_key)

        frame_blobs[fn] = blobs
        fn += 1
        if fn % 50 == 0:
            print(f"  {fn}/{total} frames scanned...")

    cap.release()

    # Remove blobs that ended up in static positions
    for fnum in frame_blobs:
        frame_blobs[fnum] = [
            (cx, cy, r, conf)
            for (cx, cy, r, conf) in frame_blobs[fnum]
            if not any(((cx-sx)**2 + (cy-sy)**2)**0.5 < BLACKLIST_RADIUS
                       for sx, sy in static_positions)
        ]

    # ── Trajectory linking ────────────────────────────────────────────────────
    print("Linking blobs into trajectories...")
    tracks = _link_tracks(frame_blobs)
    # Keep only tracks with 3+ frames
    tracks = [t for t in tracks if len(t) >= 3]
    if not tracks:
        print("No ball trajectory found.")
        return []

    tracks.sort(key=_score_track, reverse=True)
    best_track = tracks[0]
    ball_pos   = {entry[0]: entry[1:] for entry in best_track}  # frame -> (cx, cy, r, conf)

    t_start = best_track[0][0]
    t_end   = best_track[-1][0]
    score   = _score_track(best_track)
    print(f"  Best track: {len(best_track)} frames  "
          f"f{t_start}-f{t_end}  "
          f"({t_start/fps:.1f}s-{t_end/fps:.1f}s)  "
          f"score={score:.1f}")

    # ── Pass 2: write annotated video ─────────────────────────────────────────
    print("Pass 2/2 — writing annotated video...")
    cap2   = cv2.VideoCapture(video_path)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out    = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    detections = []
    trail = []
    fn = 0

    while True:
        ret, frame = cap2.read()
        if not ret:
            break

        if fn in ball_pos:
            cx, cy, r, conf = ball_pos[fn]
            trail.append((cx, cy))
            if len(trail) > 12:
                trail.pop(0)

            # Draw trailing path
            for k in range(1, len(trail)):
                alpha = k / len(trail)
                cv2.line(frame, trail[k-1], trail[k],
                         (0, int(255 * alpha), 0), 1)

            # Draw detection circle
            cv2.circle(frame, (cx, cy), int(r) + 4, (0, 255, 255), 1)
            cv2.circle(frame, (cx, cy), int(r),     (0, 255, 0),   2)
            cv2.circle(frame, (cx, cy), 3,          (0, 255, 0),  -1)
            label = f"ball {conf:.0%}"
            cv2.putText(frame, label, (cx + 8, cy - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)

            detections.append({
                "frame":      fn,
                "x":          cx,
                "y":          cy,
                "radius":     r,
                "confidence": conf,
            })

        cv2.putText(frame, f"frame {fn}  ball: {len(detections)}",
                    (10, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        out.write(frame)
        fn += 1

    cap2.release()
    out.release()

    print(f"\nDone.")
    print(f"  Total frames  : {fn}")
    print(f"  Ball detected : {len(detections)} frames ({len(detections)/fn*100:.1f}%)")
    print(f"  Output saved  : {output_path}")

    return detections


# ── Run from command line ──────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--video",  required=True, help="Path to your MP4 video")
    parser.add_argument("--output", default="tracked_output.mp4", help="Where to save annotated video")
    args = parser.parse_args()

    detections = track_video(args.video, args.output)

    # Print a summary of where the ball was found
    if detections:
        print(f"\nFirst 10 detections:")
        print(f"  {'Frame':>6}  {'X':>5}  {'Y':>5}  {'Radius':>6}  {'Conf':>5}")
        print(f"  {'':->6}  {'':->5}  {'':->5}  {'':->6}  {'':->5}")
        for d in detections[:10]:
            print(f"  {d['frame']:>6}  {d['x']:>5}  {d['y']:>5}  {d['radius']:>6.1f}  {d['confidence']:>5.2f}")

        if len(detections) > 10:
            print(f"  ... and {len(detections) - 10} more")
    else:
        print("\nNo ball detected in any frame.")
        print("Try adjusting the colour ranges at the top of ball_tracker.py")
        print("Open mask_debug.jpg to see what colours were matched.")
