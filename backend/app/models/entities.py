from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    status: Mapped[str] = mapped_column(String(32), default="Ready")
    duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fps: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    codec: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    video_path: Mapped[str] = mapped_column(String(512))

    @property
    def media_token(self) -> str:
        from backend.app.core.media_tokens import create_media_token

        return create_media_token(self.owner_id or "", self.id)

    transcript: Mapped[Optional["Transcript"]] = relationship(back_populates="project")
    scenes: Mapped[list["Scene"]] = relationship(back_populates="project")
    clips: Mapped[list["Clip"]] = relationship(back_populates="project")


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), unique=True)
    language: Mapped[str] = mapped_column(String(16))
    full_text: Mapped[str] = mapped_column(Text)
    segments_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    project: Mapped[Project] = relationship(back_populates="transcript")


class Scene(Base):
    __tablename__ = "scenes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    start: Mapped[float] = mapped_column(Float)
    end: Mapped[float] = mapped_column(Float)
    project: Mapped[Project] = relationship(back_populates="scenes")


class Clip(Base):
    __tablename__ = "clips"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    start: Mapped[float] = mapped_column(Float)
    end: Mapped[float] = mapped_column(Float)
    title: Mapped[str] = mapped_column(String(255))
    hook: Mapped[str] = mapped_column(Text)
    score: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    output_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    project: Mapped[Project] = relationship(back_populates="clips")


class StyleProfile(Base):
    __tablename__ = "style_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    profile_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
