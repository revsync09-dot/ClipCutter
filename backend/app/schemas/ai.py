from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    words: list[dict[str, Any]] = []


class TranscriptResponse(BaseModel):
    id: int
    project_id: str
    language: str
    full_text: str
    segments: list[TranscriptSegment]
    created_at: datetime


class ClipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: str
    start: float
    end: float
    title: str
    hook: str
    score: int
    reason: str
    output_path: str | None
