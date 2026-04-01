# CricketTrack Processor

Python FastAPI microservice for cricket bowling video analysis.

## What this service does

Receives a video URL + session ID from the Next.js backend,
runs ball detection (mock for now, YOLOv8 in B5), and writes
delivery-level analytics back to Supabase.

## File structure

| File | Purpose |
|---|---|
| `main.py` | FastAPI app, routes, CORS config |
| `models.py` | Pydantic request/response models |
| `mock_detector.py` | Generates realistic fake bowling analytics |
| `processor.py` | Orchestrates processing + Supabase writes |
| `requirements.txt` | Python dependencies |
| `.env.example` | Environment variable template |

## Setup

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env      # fill in your values
uvicorn main:app --reload --port 8000
```

## Environment variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (bypasses RLS) |
| `ALLOWED_ORIGIN` | Next.js app URL for CORS |

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/process` | Process a session (called by Next.js cron) |
| GET | `/session/{id}` | Fetch analytics for a session |
| POST | `/process/test` | Quick test without a real upload |
