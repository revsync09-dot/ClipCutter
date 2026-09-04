# ClipForge Cutter

ClipForge Cutter turns long footage into polished TikTok, Reels, YouTube Shorts and full YouTube videos. The frontend runs on Vercel, Supabase provides authentication and account-scoped metadata, and a persistent container host runs the FFmpeg/Whisper video backend.

## Version 1 progress

The repository contains the responsive editor, authenticated FastAPI API, resumable uploads, FFprobe validation, thumbnails, transcription, Smart Cuts, preview rendering, export, owner controls and showcase APIs. Production setup and required environment variables are documented in `DEPLOYMENT.md`.

## Requirements

- Windows 10 or 11
- Python 3.12
- Node.js 22+
- FFmpeg and ffprobe
- Ollama (the app can start without its service running)

## Install

From this directory, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
```

The setup script creates `.venv`, installs Python and frontend packages, installs FFmpeg/Ollama through winget when missing, and runs the backend tests.

## Run

```powershell
python run.py
```

The editor opens at `http://localhost:5173`. Interactive API documentation is at `http://127.0.0.1:8000/docs`.

## Video processing

Speech recognition uses `faster-whisper`, with CPU fallback and optional GPU acceleration. FFmpeg and FFprobe perform media inspection and rendering. In production, the backend needs a long-running container and persistent storage; Vercel only hosts the frontend.

## Local files

- Uploaded source videos: `backend/storage/uploads`
- Generated videos: `backend/storage/outputs`
- Thumbnails: `backend/storage/thumbnails`
- Transcript artifacts: `backend/storage/transcripts`
- SQLite database: `backend/database/clipforge.db`

These runtime files are intentionally excluded from Git.

## Troubleshooting

### FFmpeg is not detected

Close and reopen PowerShell after installation, then run `ffmpeg -version`. If needed, rerun the setup script; the backend also recognizes the standard winget FFmpeg location.

### Whisper is slow or fails

The first transcription downloads the selected free model. CPU transcription can be slow. Verify installation with `.\.venv\Scripts\python.exe -c "import faster_whisper; print('ok')"`. CUDA is optional.

### Ollama is offline

Start Ollama from the Start menu or run `ollama serve`. Then install a small free local model with `ollama pull qwen2.5:3b`. Phase 6 will add model discovery and selection in the app.

### Ports are already in use

ClipForge uses ports 5173 and 8000. Stop the existing process or set `CLIPFORGE_FRONTEND_PORT` and `CLIPFORGE_API_PORT` before starting.
