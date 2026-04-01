"""
models.py
─────────
Pydantic models for all request/response shapes in the processor service.
All logic lives in processor.py and mock_detector.py — this file is data only.
"""

from pydantic import BaseModel
from typing import Optional


# ─── Inbound ──────────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    session_id: str
    video_url: str
    bowler_name: Optional[str] = None


# ─── Ball tracking ────────────────────────────────────────────────────────────

class BallPosition(BaseModel):
    frame: int
    x: float        # 0.0 – 1.0 normalised horizontal position
    y: float        # 0.0 – 1.0 normalised vertical position (0 = top)
    confidence: float  # 0.0 – 1.0 detection confidence


# ─── Single delivery ──────────────────────────────────────────────────────────

class Delivery(BaseModel):
    delivery_number: int
    ball_path: list[BallPosition]
    pitch_x: float      # where ball landed, normalised 0–1
    pitch_y: float      # where ball landed, normalised 0–1
    length_type: str    # yorker | full | good_length | short
    line_type: str      # on_line | off_line
    speed_estimate: float   # km/h
    clip_start_frame: int
    clip_end_frame: int


# ─── Session-level analytics ──────────────────────────────────────────────────

class SessionAnalytics(BaseModel):
    session_id: str
    total_deliveries: int
    deliveries: list[Delivery]
    line_consistency_pct: float     # % of deliveries that were on_line
    length_distribution: dict       # {yorker: %, full: %, good_length: %, short: %}
    avg_speed: float
    max_speed: float
    min_speed: float
    summary_text: str


# ─── Outbound ─────────────────────────────────────────────────────────────────

class ProcessResponse(BaseModel):
    session_id: str
    status: str                             # complete | failed
    analytics: Optional[SessionAnalytics] = None
    error: Optional[str] = None
    processing_time_seconds: float
