from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.app.core.config import settings
from backend.app.core.config import PROJECT_ROOT
from backend.app.core.auth import AuthenticatedUser, get_current_user


router = APIRouter(prefix="/examples", tags=["examples"])
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}
MAX_EXAMPLE_BYTES = 8 * 1024 * 1024 * 1024
CHUNK_BYTES = 8 * 1024 * 1024


def _metadata_path() -> Path:
    return (settings.storage_path / "examples" / "examples.json").resolve()


def _load_examples() -> list[dict[str, str]]:
    path = _metadata_path()
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _source_examples_dir() -> Path:
    return (PROJECT_ROOT / "frontend" / "public" / "showcase" / "videos").resolve()


def _source_examples() -> list[dict[str, str]]:
    folder = _source_examples_dir()
    if not folder.is_dir():
        return []
    return [
        {
            "id": f"source-{path.name}",
            "filename": path.name,
            "title": path.stem.replace("-", " ").replace("_", " ").strip().title(),
            "created_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
            "video_url": f"/api/examples/source/{path.name}",
        }
        for path in sorted(folder.iterdir())
        if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS
    ]
def _save_examples(examples: list[dict[str, str]]) -> None:
    _metadata_path().write_text(json.dumps(examples, ensure_ascii=False, indent=2), encoding="utf-8")


@router.get("")
def list_examples() -> list[dict[str, str]]:
    return [*_source_examples(), *_load_examples()]


@router.post("", status_code=201)
async def upload_example(
    file: UploadFile = File(...),
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, str]:
    if not settings.is_owner(user.id, user.email):
        raise HTTPException(status_code=404, detail="Not found")
    original_name = Path(file.filename or "beispielvideo").name[:255]
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unterstützt werden MP4, MOV, MKV und WebM.")
    example_id = str(uuid4())
    target = (settings.storage_path / "examples" / f"{example_id}{extension}").resolve()
    total = 0
    try:
        async with aiofiles.open(target, "wb") as output:
            while chunk := await file.read(CHUNK_BYTES):
                total += len(chunk)
                if total > MAX_EXAMPLE_BYTES:
                    raise HTTPException(status_code=413, detail="Das Beispielvideo ist größer als 8 GB.")
                await output.write(chunk)
        item = {
            "id": example_id,
            "filename": original_name,
            "title": Path(original_name).stem,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "video_url": f"/api/examples/{example_id}/video",
        }
        examples = [item, *_load_examples()]
        _save_examples(examples)
        return item
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/source/{filename}")
def source_example_video(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    candidate = (_source_examples_dir() / safe_name).resolve()
    if candidate.parent != _source_examples_dir() or candidate.suffix.lower() not in ALLOWED_EXTENSIONS or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Source-Beispielvideo nicht gefunden.")
    media_types = {".mp4": "video/mp4", ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".webm": "video/webm"}
    return FileResponse(candidate, media_type=media_types.get(candidate.suffix.lower()), filename=candidate.name)


@router.get("/{example_id}/video")
def example_video(example_id: str) -> FileResponse:
    item = next((entry for entry in _load_examples() if entry.get("id") == example_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Beispielvideo nicht gefunden.")
    matches = list((settings.storage_path / "examples").glob(f"{example_id}.*"))
    video = next((path for path in matches if path.suffix.lower() in ALLOWED_EXTENSIONS and path.is_file()), None)
    if not video:
        raise HTTPException(status_code=404, detail="Beispieldatei nicht gefunden.")
    return FileResponse(video, media_type="video/mp4" if video.suffix.lower() == ".mp4" else None, filename=item.get("filename"))
