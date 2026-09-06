from pydantic import BaseModel


class ToolStatus(BaseModel):
    available: bool
    version: str | None = None
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    r2_enabled: bool = False


class SystemStatus(BaseModel):
    ffmpeg: ToolStatus
    ffprobe: ToolStatus
    ollama: ToolStatus
    whisper: ToolStatus
    gpu_detected: bool
    python_version: str

