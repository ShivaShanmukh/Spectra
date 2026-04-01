"""
processor.py
────────────
SessionProcessor — orchestrates the full processing pipeline for one session:
  1. Simulates video download + ball detection delays
  2. Calls MockBallDetector to generate analytics
  3. Writes deliveries + analytics rows to Supabase
  4. Updates session status to 'complete' or 'failed'

This is the only file that talks to Supabase.
"""

import asyncio
import logging
import os
import time

from supabase import create_client, Client
from dotenv import load_dotenv

from models import Delivery, ProcessRequest, ProcessResponse, SessionAnalytics
from mock_detector import MockBallDetector

load_dotenv()

logger = logging.getLogger(__name__)

# ─── Supabase client (service role — bypasses RLS) ────────────────────────────

def _get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    return create_client(url, key)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _delivery_to_row(delivery: Delivery, session_id: str) -> dict:
    """Convert a Delivery model to a Supabase-ready dict."""
    return {
        "session_id": session_id,
        "delivery_number": delivery.delivery_number,
        "pitch_x": delivery.pitch_x,
        "pitch_y": delivery.pitch_y,
        "length_type": delivery.length_type,
        "line_type": delivery.line_type,
        "speed_estimate": delivery.speed_estimate,
        # ball_path stored as jsonb — include confidence for richer data
        "ball_path": [
            {"frame": p.frame, "x": p.x, "y": p.y, "confidence": p.confidence}
            for p in delivery.ball_path
        ],
        "clip_url": None,  # populated later when clip export is built
    }


def _analytics_to_row(analytics: SessionAnalytics) -> dict:
    """Convert SessionAnalytics to a Supabase-ready dict."""
    return {
        "session_id": analytics.session_id,
        "total_deliveries": analytics.total_deliveries,
        "line_consistency_pct": analytics.line_consistency_pct,
        "length_distribution": analytics.length_distribution,
        "avg_speed": analytics.avg_speed,
        "max_speed": analytics.max_speed,
        "min_speed": analytics.min_speed,
        "summary_text": analytics.summary_text,
    }


# ─── Processor ────────────────────────────────────────────────────────────────

class SessionProcessor:

    def __init__(self):
        self.detector = MockBallDetector()

    async def process_session(self, request: ProcessRequest) -> ProcessResponse:
        session_id = request.session_id
        started_at = time.monotonic()

        logger.info(f"Starting processing for session {session_id}")

        supabase = _get_supabase()

        try:
            # ── Stage 1: simulate video download ──────────────────────────────
            logger.info(f"[{session_id}] Stage 1/3 — downloading video...")
            await asyncio.sleep(2 + (time.monotonic() % 2))  # 2–4 s

            # ── Stage 2: simulate ball detection ──────────────────────────────
            logger.info(f"[{session_id}] Stage 2/3 — running ball detection...")
            await asyncio.sleep(3 + (time.monotonic() % 3))  # 3–6 s

            # ── Stage 3: generate mock analytics ──────────────────────────────
            logger.info(f"[{session_id}] Stage 3/3 — computing analytics...")
            await asyncio.sleep(1 + (time.monotonic() % 1))  # 1–2 s

            analytics = self.detector.generate_session(session_id)

            # ── Write deliveries to Supabase ───────────────────────────────────
            logger.info(f"[{session_id}] Writing {analytics.total_deliveries} deliveries...")

            delivery_rows = [
                _delivery_to_row(d, session_id) for d in analytics.deliveries
            ]

            result = supabase.table("deliveries").insert(delivery_rows).execute()
            if not result.data:
                raise RuntimeError("Deliveries insert returned no data")

            # ── Write analytics to Supabase ────────────────────────────────────
            logger.info(f"[{session_id}] Writing session analytics...")

            analytics_row = _analytics_to_row(analytics)
            result = supabase.table("analytics").insert(analytics_row).execute()
            if not result.data:
                raise RuntimeError("Analytics insert returned no data")

            # ── Mark session complete ──────────────────────────────────────────
            supabase.table("sessions").update({"status": "complete"}).eq(
                "id", session_id
            ).execute()

            elapsed = round(time.monotonic() - started_at, 2)
            logger.info(f"[{session_id}] Done in {elapsed}s")

            return ProcessResponse(
                session_id=session_id,
                status="complete",
                analytics=analytics,
                processing_time_seconds=elapsed,
            )

        except Exception as exc:
            elapsed = round(time.monotonic() - started_at, 2)
            error_msg = str(exc)
            logger.error(f"[{session_id}] Failed after {elapsed}s: {error_msg}")

            # Best-effort: mark session failed
            try:
                supabase.table("sessions").update({"status": "failed"}).eq(
                    "id", session_id
                ).execute()
            except Exception:
                pass  # don't mask the original error

            return ProcessResponse(
                session_id=session_id,
                status="failed",
                error=error_msg,
                processing_time_seconds=elapsed,
            )
