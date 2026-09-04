from fastapi import APIRouter

from backend.app.core.config import settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings() -> dict[str, str | int]:
    return {
        "whisper_model": settings.whisper_model,
        "ollama_url": settings.ollama_url,
        "default_fps": 30,
        "output_resolution": "1080x1920",
    }

