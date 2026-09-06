from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    original_filename: str
    created_at: datetime
    status: str
    duration: float | None
    width: int | None
    height: int | None
    fps: float | None
    codec: str | None
    thumbnail_path: str | None
    media_token: str


class ChunkedUploadInit(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(default="application/octet-stream", max_length=100)
    size: int = Field(gt=0, le=10 * 1024 * 1024 * 1024)


class ReferenceStyleResponse(BaseModel):
    filename: str
    duration: float
    width: int
    height: int
    fps: float
    scene_count: int
    average_shot_length: float
    target_clip_duration: float
    suggested_platform: str
    brightness: float
    contrast: float
    saturation: float
    motion_score: float
    text_activity: float
    recommended_font: str
    style_summary: str


class ReactionSyncResponse(BaseModel):
    filename: str
    duration: float
    width: int
    height: int
    offset_seconds: float
    confidence: float


class ReactionOffsetUpdate(BaseModel):
    offset_seconds: float = Field(ge=-120, le=120)
