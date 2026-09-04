from typing import Literal

from pydantic import BaseModel, Field


class JobResponse(BaseModel):
    id: str
    project_id: str
    kind: str
    status: Literal["queued", "processing", "completed", "failed"]
    progress: float = Field(ge=0, le=100)
    message: str
    error: str | None = None
    output_url: str | None = None
    preview_url: str | None = None


class AutoCutRequest(BaseModel):
    platform: Literal["tiktok", "instagram", "shorts", "youtube"] = "shorts"


class HeadlineSuggestionRequest(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    platform: Literal["tiktok", "instagram", "shorts", "youtube"] = "shorts"


class HeadlineSuggestionResponse(BaseModel):
    main_headline: str
    reaction_headline: str


class RenderRequest(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    mode: Literal["fit", "crop"] = "crop"
    fps: Literal["original", "30", "60"] = "original"
    filename: str = Field(default="clipforge-export", min_length=1, max_length=100)
    captions: bool = False
    caption_style: Literal["minimal", "bold", "gaming", "creator", "karaoke", "boxed", "neon", "documentary"] = "bold"
    caption_uppercase: bool = False
    words_per_caption: int = Field(default=4, ge=2, le=5)
    caption_animation: Literal["none", "pop", "slide", "karaoke"] = "pop"
    caption_x: float = Field(default=50, ge=5, le=95)
    caption_y: float = Field(default=68, ge=5, le=95)
    caption_size: int = Field(default=88, ge=36, le=140)
    platform: Literal["tiktok", "instagram", "shorts", "youtube"] = "shorts"
    layout: Literal["standard", "blur_center", "reaction_top", "main_top", "picture_in_picture"] = "reaction_top"
    headline: str = Field(default="", max_length=120)
    headline_style: Literal["clean", "dark", "capsule", "bubble", "glass", "minimal"] = "clean"
    headline_position: Literal["split", "top", "bottom"] = "split"
    headline_size: int = Field(default=64, ge=36, le=110)
    headline_font: Literal["Anton", "Bebas Neue", "Montserrat", "Inter", "Archivo Black", "Bangers", "Pacifico", "Permanent Marker"] = "Montserrat"
    headline_text_color: str = Field(default="#EF1F1F", pattern=r"^#[0-9A-Fa-f]{6}$")
    headline_background_color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    headline_x: float = Field(default=50, ge=5, le=95)
    headline_y: float = Field(default=44, ge=5, le=95)
    secondary_headline: str = Field(default="", max_length=120)
    secondary_headline_x: float = Field(default=50, ge=5, le=95)
    secondary_headline_y: float = Field(default=18, ge=5, le=95)
    blur_strength: int = Field(default=32, ge=1, le=60)
    background_dim: int = Field(default=10, ge=0, le=70)
    main_x: float = Field(default=50, ge=-25, le=125)
    main_y: float = Field(default=72, ge=-25, le=125)
    main_scale: float = Field(default=1, ge=0.2, le=3)
    reaction_x: float = Field(default=50, ge=-25, le=125)
    reaction_y: float = Field(default=22, ge=-25, le=125)
    reaction_scale: float = Field(default=1, ge=0.2, le=3)
    frame_x: float = Field(default=50, ge=-25, le=125)
    frame_y: float = Field(default=22, ge=-25, le=125)
    frame_scale: float = Field(default=1, ge=0.2, le=3)
    social_safe_layout: bool = False
    main_format: Literal["source", "square", "portrait", "fill"] = "source"
    include_reaction: bool = True
    font_family: Literal["auto", "Anton", "Bebas Neue", "Montserrat", "Inter"] = "auto"
