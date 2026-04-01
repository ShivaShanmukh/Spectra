"""
trace_ball.py
Track blobs frame-by-frame and find one that moves CONSISTENTLY
(i.e. same direction, smooth path = cricket ball trajectory).

Excludes known static positions first, then links blobs across frames.

Run:
  python trace_ball.py --video "C:/Users/Superman/Downloads/test.mp4"
"""

import argparse
import cv2
import numpy as np
import os

# Known static blob positions to ignore (found from show_blobs output)
STATIC_POSITIONS = [
    (229, 105),
    (206, 102),
    (234, 60),
    (316, 569),
    (234, 571),
    (260, 572),
]
STATIC_IGNORE_RADIUS = 18   # pixels — anything within this of a static pos = ignored


def is_static(cx, cy):
    for sx, sy in STATIC_POSITIONS:
        if ((cx - sx) ** 2 + (cy - sy) ** 2) ** 0.5 < STATIC_IGNORE_RADIUS:
            return True
    return False


WHITE_LOWER = np.array([0,   0,   175])
WHITE_UPPER = np.array([180, 50,  255])

MIN_RADIUS = 4
MAX_RADIUS = 20
MIN_CIRCULARITY = 0.58


def get_blobs(frame):
    """Return non-static white blobs in the top 60% of the frame."""
    h = frame.shape[0]
    crop_h = int(h * 0.60)
    crop = frame[:crop_h, :]

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
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
        cx, cy = int(cx), int(cy)
        if is_static(cx, cy):
            continue
        blobs.append((cx, cy, round(r, 1)))
    return blobs


def dist2d(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video",  required=True)
    parser.add_argument("--start",  type=int, default=235)
    parser.add_argument("--end",    type=int, default=275)
    parser.add_argument("--maxjump", type=float, default=40.0,
                        help="Max pixels a ball can move between frames")
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video: {int(cap.get(3))}x{int(cap.get(4))}  {fps:.0f}fps  {total} frames")
    print(f"Scanning frames {args.start}-{args.end}")

    # ── Collect blobs per frame ──────────────────────────────────────────────
    frame_data = {}   # frame_num -> list of (cx, cy, r)
    cap.set(cv2.CAP_PROP_POS_FRAMES, args.start)
    for fn in range(args.start, min(args.end + 1, total)):
        ret, frame = cap.read()
        if not ret:
            break
        frame_data[fn] = get_blobs(frame)
    cap.release()

    # ── Build candidate tracks ───────────────────────────────────────────────
    # A track is a list of (frame_num, cx, cy, r) entries
    # We grow tracks greedily: for each blob in frame N,
    # find the nearest blob in frame N+1 within maxjump px.

    tracks = []   # list of tracks; each track is a list of (fn, cx, cy, r)

    frames = sorted(frame_data.keys())

    # Seed tracks from first frame
    for blob in frame_data.get(frames[0], []):
        tracks.append([(frames[0], blob[0], blob[1], blob[2])])

    # Extend each track
    for i in range(1, len(frames)):
        fn = frames[i]
        curr_blobs = list(frame_data.get(fn, []))
        used = set()

        for track in tracks:
            if len(track) == 0:
                continue
            last_fn, lx, ly, _ = track[-1]
            if last_fn != frames[i - 1]:
                continue   # track was not extended last frame — skip

            # Find nearest unmatched blob within maxjump
            best_idx, best_d = None, args.maxjump + 1
            for j, (cx, cy, r) in enumerate(curr_blobs):
                if j in used:
                    continue
                d = dist2d((lx, ly), (cx, cy))
                if d < best_d:
                    best_d, best_idx = d, j

            if best_idx is not None:
                cx, cy, r = curr_blobs[best_idx]
                track.append((fn, cx, cy, r))
                used.add(best_idx)

        # Start new tracks for unmatched blobs
        for j, (cx, cy, r) in enumerate(curr_blobs):
            if j not in used:
                tracks.append([(fn, cx, cy, r)])

    # ── Score tracks: length + direction consistency ─────────────────────────
    scored = []
    for track in tracks:
        if len(track) < 3:
            continue

        # Direction consistency: compute step vectors, check variance
        vecs = []
        for k in range(1, len(track)):
            dx = track[k][1] - track[k-1][1]
            dy = track[k][2] - track[k-1][2]
            vecs.append((dx, dy))

        if not vecs:
            continue

        avg_dx = sum(v[0] for v in vecs) / len(vecs)
        avg_dy = sum(v[1] for v in vecs) / len(vecs)
        speed  = (avg_dx ** 2 + avg_dy ** 2) ** 0.5

        # Variance of direction (lower = more consistent = more ball-like)
        var_dx = sum((v[0] - avg_dx) ** 2 for v in vecs) / len(vecs)
        var_dy = sum((v[1] - avg_dy) ** 2 for v in vecs) / len(vecs)
        dir_var = (var_dx + var_dy) ** 0.5

        # Prefer long tracks with consistent direction and reasonable speed
        score = len(track) * speed / max(dir_var + 1, 1)
        scored.append((score, track, speed, dir_var))

    scored.sort(key=lambda x: -x[0])

    print(f"\nTop 5 candidate ball tracks (by length x speed / direction variance):")
    print(f"  {'Rank':>4}  {'Frames':>6}  {'Speed':>7}  {'DirVar':>7}  {'Score':>8}  Start->End")
    print(f"  {'':->4}  {'':->6}  {'':->7}  {'':->7}  {'':->8}  ----------")
    for rank, (score, track, speed, dvar) in enumerate(scored[:5], 1):
        start = track[0]
        end   = track[-1]
        print(f"  {rank:>4}  {len(track):>6}  {speed:>7.1f}  {dvar:>7.1f}  {score:>8.1f}  "
              f"({start[1]},{start[2]})@f{start[0]} -> ({end[1]},{end[2]})@f{end[0]}")

    if not scored:
        print("  No tracks found — try widening --maxjump or colour range")
        return

    # ── Save annotated frames for best track ────────────────────────────────
    best_track = scored[0][1]
    ball_positions = {fn: (cx, cy, r) for fn, cx, cy, r in best_track}

    print(f"\nBest track has {len(best_track)} frames")
    print("Saving annotated video frames to ball_confirm/trace_*.jpg ...")

    os.makedirs("ball_confirm", exist_ok=True)

    cap2 = cv2.VideoCapture(args.video)
    # Draw trail using last 10 positions
    trail = []

    cap2.set(cv2.CAP_PROP_POS_FRAMES, args.start)
    for fn in range(args.start, min(args.end + 1, total)):
        ret, frame = cap2.read()
        if not ret:
            break

        if fn in ball_positions:
            cx, cy, r = ball_positions[fn]
            trail.append((cx, cy))
            if len(trail) > 10:
                trail.pop(0)

            # Draw trail
            for k in range(1, len(trail)):
                alpha = k / len(trail)
                c = int(255 * alpha)
                cv2.line(frame, trail[k-1], trail[k], (0, c, 0), 1)

            # Draw ball circle
            cv2.circle(frame, (cx, cy), int(r) + 4, (0, 255, 255), 1)
            cv2.circle(frame, (cx, cy), int(r),     (0, 255, 0),   2)
            cv2.circle(frame, (cx, cy), 3,          (0, 255, 0),  -1)
            t = fn / fps
            cv2.putText(frame, f"BALL ({cx},{cy})", (cx + 8, cy - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)

        cv2.putText(frame, f"frame {fn}  t={fn/fps:.2f}s", (8, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.imwrite(f"ball_confirm/trace_{fn:04d}.jpg", frame)

    cap2.release()
    print("Done. Check ball_confirm/trace_*.jpg — the green circled blob should be the ball.")
    print("If it is wrong, run: python trace_ball.py --video ... --maxjump 25")


if __name__ == "__main__":
    main()
