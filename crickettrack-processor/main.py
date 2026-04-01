"""
main.py
───────
FastAPI app entry point for the CricketTrack processor service.

Endpoints:
  POST /process           — main worker, called by Next.js B3 cron
  GET  /health            — health check for Railway / Render
  GET  /session/{id}      — fetch analytics for a completed session (debug)
  POST /process/test      — run a full mock process without a real upload
"""

import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client

from models import ProcessRequest, ProcessResponse
from processor import SessionProcessor

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CricketTrack Processor",
    description="Mock video processing service for cricket bowling analysis",
    version="0.1.0",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

allowed_origin = os.getenv("ALLOWED_ORIGIN", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Shared processor instance ────────────────────────────────────────────────

processor = SessionProcessor()


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Health check — used by Railway / Render to confirm service is up."""
    return {
        "status": "ok",
        "service": "crickettrack-processor",
        "version": "0.1.0",
    }


@app.post("/process", response_model=ProcessResponse)
async def process(request: ProcessRequest):
    """
    Main worker endpoint.
    Called by the Next.js job queue worker (B3) via POST.
    Runs the full mock detection pipeline and writes results to Supabase.
    """
    logger.info(f"POST /process — session={request.session_id}")
    response = await processor.process_session(request)

    # Return 200 even on processing failure — the error is in the response body.
    # The Next.js worker reads response.status to decide what to do.
    return response


@app.get("/session/{session_id}")
def get_session_analytics(session_id: str):
    """
    Fetch analytics for a completed session directly from Supabase.
    Useful for debugging without going through the Next.js API.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase env vars not set")

    supabase = create_client(url, key)

    result = (
        supabase.table("analytics")
        .select("*")
        .eq("session_id", session_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail=f"No analytics found for session {session_id}",
        )

    return result.data


@app.post("/process/test", response_model=ProcessResponse)
async def process_test():
    """
    Run a full mock pipeline — no real upload needed.
    Creates a temporary auth user + session, runs the full processor,
    writes real deliveries + analytics rows to Supabase, then cleans up.
    Safe to run repeatedly.
    """
    logger.info("POST /process/test — running mock pipeline")

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase env vars not set")

    sb = create_client(url, key)

    # 1. Create a temporary test user
    import time as _time
    test_email = f"processor-test-{int(_time.time())}@crickettrack.test"
    user_res = sb.auth.admin.create_user({
        "email": test_email,
        "password": "TestPass123!",
        "email_confirm": True,
    })
    test_user_id = user_res.user.id

    # 2. Create a temporary session row
    session_res = (
        sb.table("sessions")
        .insert({
            "user_id": test_user_id,
            "bowler_name": "Test Bowler",
            "video_url": "mock://test-video.mp4",
            "status": "uploaded",
        })
        .execute()
    )
    test_session_id = session_res.data[0]["id"]

    logger.info(f"Test session created: {test_session_id}")

    # 3. Run the full processor
    test_request = ProcessRequest(
        session_id=test_session_id,
        video_url="mock://test-video.mp4",
        bowler_name="Test Bowler",
    )
    response = await processor.process_session(test_request)

    # 4. Clean up — delete session (cascades to deliveries + analytics)
    #    then delete the temp user
    try:
        sb.table("sessions").delete().eq("id", test_session_id).execute()
        sb.auth.admin.delete_user(test_user_id)
        logger.info(f"Test cleanup done for session {test_session_id}")
    except Exception as e:
        logger.warning(f"Test cleanup failed (non-fatal): {e}")

    return response
