"""
mock_detector.py
────────────────
MockBallDetector — generates realistic fake cricket bowling data.
No real computer vision here. This lets the entire frontend pipeline
be built and tested before YOLOv8 ball detection is integrated in B5.
"""

import random
import math
from models import BallPosition, Delivery, SessionAnalytics


# ─── Pitch zone definitions (normalised 0–1, y=0 is bowling end) ─────────────

PITCH_ZONES = {
    "yorker":      {"y": (0.80, 0.92), "prob": 0.15},
    "full":        {"y": (0.65, 0.80), "prob": 0.25},
    "good_length": {"y": (0.45, 0.65), "prob": 0.40},
    "short":       {"y": (0.25, 0.45), "prob": 0.20},
}

# x range when on line (near stumps), off line (wide)
LINE_X = {
    "on_line":  (0.42, 0.58),
    "off_line": (0.58, 0.72),
}

# Speed ranges per length type (km/h)
SPEED_RANGES = {
    "yorker":      (75, 90),
    "full":        (68, 82),
    "good_length": (65, 78),
    "short":       (60, 72),
}


class MockBallDetector:

    # ─── Single delivery ──────────────────────────────────────────────────────

    def generate_delivery(self, delivery_number: int) -> Delivery:
        """
        Generate one realistic delivery.
        Ball path travels from bowling end (y≈0.1) to landing spot
        with a natural swing curve and small per-frame wobble.
        """

        # 1. Pick length type using weighted probability
        length_type = random.choices(
            list(PITCH_ZONES.keys()),
            weights=[PITCH_ZONES[k]["prob"] for k in PITCH_ZONES],
        )[0]

        # 2. Pick line type
        line_type = random.choices(
            ["on_line", "off_line"],
            weights=[0.75, 0.25],
        )[0]

        # 3. Determine landing coordinates
        y_min, y_max = PITCH_ZONES[length_type]["y"]
        x_min, x_max = LINE_X[line_type]
        pitch_x = round(random.uniform(x_min, x_max), 4)
        pitch_y = round(random.uniform(y_min, y_max), 4)

        # 4. Speed
        sp_min, sp_max = SPEED_RANGES[length_type]
        speed_estimate = round(random.uniform(sp_min, sp_max), 1)

        # 5. Ball path — 18 to 25 frames
        num_frames = random.randint(18, 25)
        clip_start_frame = random.randint(0, 5)
        clip_end_frame = clip_start_frame + num_frames - 1

        # Start position near bowling end, slightly off-centre
        x_start = random.uniform(0.45, 0.55)
        y_start = random.uniform(0.05, 0.15)

        # Swing: small lateral drift across the delivery
        # Outswing drifts ball away (x increases), inswing toward (x decreases)
        swing_direction = random.choice([-1, 1])
        swing_amount = random.uniform(0.01, 0.04)

        ball_path: list[BallPosition] = []

        for i in range(num_frames):
            t = i / (num_frames - 1)  # 0.0 → 1.0

            # y: accelerates slightly as ball drops (gravity effect)
            y = y_start + (pitch_y - y_start) * (t ** 0.9)

            # x: linear travel toward landing x + swing curve + wobble
            x_base = x_start + (pitch_x - x_start) * t
            swing = swing_direction * swing_amount * math.sin(t * math.pi)
            wobble = random.uniform(-0.004, 0.004)
            x = x_base + swing + wobble

            # Clamp to valid range
            x = round(max(0.0, min(1.0, x)), 4)
            y = round(max(0.0, min(1.0, y)), 4)

            confidence = round(random.uniform(0.82, 0.97), 3)

            ball_path.append(
                BallPosition(
                    frame=clip_start_frame + i,
                    x=x,
                    y=y,
                    confidence=confidence,
                )
            )

        return Delivery(
            delivery_number=delivery_number,
            ball_path=ball_path,
            pitch_x=pitch_x,
            pitch_y=pitch_y,
            length_type=length_type,
            line_type=line_type,
            speed_estimate=speed_estimate,
            clip_start_frame=clip_start_frame,
            clip_end_frame=clip_end_frame,
        )

    # ─── Full session ─────────────────────────────────────────────────────────

    def generate_session(
        self,
        session_id: str,
        num_deliveries: int | None = None,
    ) -> SessionAnalytics:
        """
        Generate analytics for a full bowling session.
        Aggregates stats across all deliveries and writes a summary.
        """

        if num_deliveries is None:
            num_deliveries = random.randint(18, 28)

        deliveries = [
            self.generate_delivery(i + 1) for i in range(num_deliveries)
        ]

        # ── Aggregate stats ────────────────────────────────────────────────

        speeds = [d.speed_estimate for d in deliveries]
        avg_speed = round(sum(speeds) / len(speeds), 1)
        max_speed = round(max(speeds), 1)
        min_speed = round(min(speeds), 1)

        on_line_count = sum(1 for d in deliveries if d.line_type == "on_line")
        off_line_count = num_deliveries - on_line_count
        line_consistency_pct = round((on_line_count / num_deliveries) * 100, 1)

        length_counts: dict[str, int] = {
            "yorker": 0,
            "full": 0,
            "good_length": 0,
            "short": 0,
        }
        for d in deliveries:
            length_counts[d.length_type] += 1

        length_distribution = {
            k: round((v / num_deliveries) * 100, 1)
            for k, v in length_counts.items()
        }

        # ── Summary text ───────────────────────────────────────────────────

        summary_parts: list[str] = []

        if line_consistency_pct >= 75:
            summary_parts.append("Great line consistency today.")
        else:
            summary_parts.append(
                f"Work on your line — {off_line_count} "
                f"deliver{'y' if off_line_count == 1 else 'ies'} "
                f"{'was' if off_line_count == 1 else 'were'} off target."
            )

        yorker_pct = length_distribution["yorker"]
        good_length_pct = length_distribution["good_length"]

        if good_length_pct >= 35:
            summary_parts.append("Good length distribution.")
        elif yorker_pct >= 20:
            summary_parts.append("Impressive yorker accuracy.")
        else:
            summary_parts.append("Try varying your length more.")

        summary_text = " ".join(summary_parts)

        return SessionAnalytics(
            session_id=session_id,
            total_deliveries=num_deliveries,
            deliveries=deliveries,
            line_consistency_pct=line_consistency_pct,
            length_distribution=length_distribution,
            avg_speed=avg_speed,
            max_speed=max_speed,
            min_speed=min_speed,
            summary_text=summary_text,
        )
