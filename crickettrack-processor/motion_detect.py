"""
motion_detect.py
Use background subtraction to find moving objects, then filter for
ball-sized circular blobs. No colour assumption needed.

Run:
  python motion_detect.py --video "C:/Users/Superman/Downloads/test.mp4"
"""

import argparse
import cv2
import numpy as np
import os


# Ball size (radius in pixels) at 360x640 resolution
MIN_RADIUS = 4
MAX_RADIUS = 22
MIN_CIRCULARITY = 0.52

# Minimum speed (pixels per frame) to be considered a ball
MIN_SPEED = 5

# Max jump between frames (px) — prevents tracking separate objects as one
MAX_JUMP = 55


def dist2d(a, b):
    return ((a[0]-b[0])**2 + (a[1]-b[1])**2) ** 0.5


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end",   type=int, default=9999)
    args = parser.parse_args()

    cap = cv2.VideoCapture(args.video)
    fps   = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"Video: {w}x{h}  {fps:.0f}fps  {total} frames  ({total/fps:.1f}s)")

    # MOG2 background subtractor — learns what's "background" over time
    # history=200 means it takes ~200 frames to build background model
    # detectShadows=False is faster and avoids false grey detections
    fgbg = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=40,
                                               detectShadows=False)

    # ── Pass 1: collect moving blobs ──────────────────────────────────────────
    frame_blobs = {}   # frame_num -> list of (cx, cy, r, circ)
    fn = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if fn < args.start:
            fgbg.apply(frame)   # still train the model on early frames
            fn += 1
            continue
        if fn > args.end:
            break

        # Apply background subtractor — white = moving, black = background
        fg_mask = fgbg.apply(frame)

        # Clean up noise
        kernel = np.ones((3, 3), np.uint8)
        fg_mask = cv2.erode(fg_mask, kernel, iterations=1)
        fg_mask = cv2.dilate(fg_mask, kernel, iterations=2)

        contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)
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
            blobs.append((int(cx), int(cy), round(r, 1), round(circ, 2)))

        frame_blobs[fn] = blobs
        fn += 1

    cap.release()
    total_scanned = fn - args.start
    print(f"Scanned {total_scanned} frames, found blobs in {len(frame_blobs)} frames")

    # ── Trajectory linking ────────────────────────────────────────────────────
    # Build tracks: link blobs across consecutive frames within MAX_JUMP px
    tracks = []
    frames = sorted(frame_blobs.keys())

    for blob in frame_blobs.get(frames[0] if frames else -1, []):
        tracks.append([(frames[0],) + blob])

    for i in range(1, len(frames)):
        fn   = frames[i]
        curr = list(frame_blobs.get(fn, []))
        used = set()

        for track in tracks:
            if not track or track[-1][0] != frames[i-1]:
                continue
            _, lx, ly, _, _ = track[-1]
            best_idx, best_d = None, MAX_JUMP + 1
            for j, (cx, cy, r, c) in enumerate(curr):
                if j in used:
                    continue
                d = dist2d((lx,ly),(cx,cy))
                if d < best_d:
                    best_d, best_idx = d, j
            if best_idx is not None:
                track.append((fn,) + curr[best_idx])
                used.add(best_idx)

        for j, blob in enumerate(curr):
            if j not in used:
                tracks.append([(fn,) + blob])

    # Score and sort tracks
    def score(track):
        if len(track) < 3:
            return 0
        vecs = [(track[k][1]-track[k-1][1], track[k][2]-track[k-1][2])
                for k in range(1,len(track))]
        adx = sum(v[0] for v in vecs)/len(vecs)
        ady = sum(v[1] for v in vecs)/len(vecs)
        spd = (adx**2+ady**2)**0.5
        var = sum((v[0]-adx)**2+(v[1]-ady)**2 for v in vecs)/len(vecs)
        return len(track) * spd / max(var**0.5+1, 1)

    tracks = [t for t in tracks if len(t) >= 3]
    tracks.sort(key=score, reverse=True)

    print(f"\nTop 8 motion tracks:")
    print(f"  {'Rank':>4}  {'Len':>4}  {'Speed':>6}  Start -> End")
    for rank, t in enumerate(tracks[:8], 1):
        s = t[0]; e = t[-1]
        vecs = [(t[k][1]-t[k-1][1], t[k][2]-t[k-1][2]) for k in range(1,len(t))]
        adx = sum(v[0] for v in vecs)/len(vecs)
        ady = sum(v[1] for v in vecs)/len(vecs)
        spd = (adx**2+ady**2)**0.5
        print(f"  {rank:>4}  {len(t):>4}  {spd:>6.1f}  "
              f"({s[1]},{s[2]})@f{s[0]}({s[0]/fps:.1f}s) -> "
              f"({e[1]},{e[2]})@f{e[0]}({e[0]/fps:.1f}s)")

    if not tracks:
        print("No tracks found.")
        return

    # ── Save annotated video for top 3 tracks ────────────────────────────────
    os.makedirs("ball_confirm", exist_ok=True)

    # Use the top scoring track
    best  = tracks[0]
    ball_pos = {entry[0]: entry[1:] for entry in best}

    cap2   = cv2.VideoCapture(args.video)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out    = cv2.VideoWriter("ball_confirm/motion_tracked.mp4", fourcc, fps, (w, h))

    fgbg2  = cv2.createBackgroundSubtractorMOG2(history=200, varThreshold=40,
                                                  detectShadows=False)
    trail  = []
    fn     = 0

    while True:
        ret, frame = cap2.read()
        if not ret:
            break

        fg_mask = fgbg2.apply(frame)

        if fn in ball_pos:
            cx, cy, r, circ = ball_pos[fn]
            trail.append((cx, cy))
            if len(trail) > 14:
                trail.pop(0)

            for k in range(1, len(trail)):
                alpha = k / len(trail)
                cv2.line(frame, trail[k-1], trail[k], (0, int(255*alpha), 0), 1)

            cv2.circle(frame, (cx, cy), int(r)+4, (0, 255, 255), 1)
            cv2.circle(frame, (cx, cy), int(r),   (0, 255, 0),   2)
            cv2.circle(frame, (cx, cy), 3,         (0, 255, 0),  -1)
            cv2.putText(frame, f"ball ({cx},{cy})", (cx+8, cy-8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1)

        cv2.putText(frame, f"frame {fn}  t={fn/fps:.2f}s",
                    (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 1)
        out.write(frame)
        fn += 1

    cap2.release()
    out.release()
    print("\nSaved: ball_confirm/motion_tracked.mp4")
    print("Open it and check if the green circle follows the ball.")


if __name__ == "__main__":
    main()
