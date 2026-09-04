FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend

RUN mkdir -p /data/storage /data/database

ENV CLIPFORGE_ENV=production \
    CLIPFORGE_API_HOST=0.0.0.0 \
    CLIPFORGE_API_PORT=8000 \
    CLIPFORGE_OPEN_BROWSER=false \
    CLIPFORGE_DATABASE_PATH=/data/database/clipforge.db \
    CLIPFORGE_STORAGE_PATH=/data/storage \
    CLIPFORGE_WHISPER_CPU_MODEL=base

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD-SHELL curl -fsS "http://127.0.0.1:${PORT:-8000}/api/health" || exit 1
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
