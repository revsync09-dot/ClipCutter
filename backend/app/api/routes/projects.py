import asyncio
from pathlib import Path
import re
from uuid import UUID, uuid4

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.database import SessionLocal, get_session
from backend.app.core.config import settings
from backend.app.core.auth import current_user, get_current_user
from backend.app.models import Clip, Project, Transcript
from backend.app.schemas.ai import ClipResponse, TranscriptResponse
from backend.app.schemas.projects import ChunkedUploadInit, ProjectResponse, ReactionOffsetUpdate, ReactionSyncResponse, ReferenceStyleResponse
from backend.app.schemas.jobs import AutoCutRequest, HeadlineSuggestionRequest, HeadlineSuggestionResponse, JobResponse, RenderRequest
from backend.app.services.jobs import job_manager
from backend.app.services.supabase_sync import upsert_project
from backend.app.services.rendering import create_hls_preview, render_vertical_clip
from backend.app.services.transcription import transcribe_video
from backend.app.services.clip_analysis import analyze_best_clips
from backend.app.services.headlines import generate_dual_headlines
from backend.app.services.video import MediaInspectionError, analyze_reference_style, create_thumbnail, create_timeline_frame, inspect_video, synchronize_reaction

router = APIRouter(prefix="/projects", tags=["projects"], dependencies=[Depends(get_current_user)])
ALLOWED_EXTENSIONS = {".mp4", ".m4v", ".mov", ".mkv", ".webm"}
MIME_EXTENSIONS = {
    "video/mp4": ".mp4",
    "application/mp4": ".mp4",
    "video/x-m4v": ".m4v",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "video/webm": ".webm",
}
MAX_DURATION_SECONDS = 8 * 60 * 60
MAX_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024
PUBLIC_UPLOAD_CHUNK_LIMIT = 24 * 1024 * 1024
PUBLIC_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024
_chunk_upload_locks: dict[str, asyncio.Lock] = {}


def _video_extension(file: UploadFile, original_name: str) -> str | None:
    extension = Path(original_name).suffix.lower()
    if extension in ALLOWED_EXTENSIONS:
        return extension
    content_type = (file.content_type or "").lower().split(";", 1)[0].strip()
    return MIME_EXTENSIONS.get(content_type)


def _video_extension_from_metadata(original_name: str, content_type: str) -> str | None:
    extension = Path(original_name).suffix.lower()
    if extension in ALLOWED_EXTENSIONS:
        return extension
    normalized_type = content_type.lower().split(";", 1)[0].strip()
    return MIME_EXTENSIONS.get(normalized_type)


def _chunk_upload_paths(upload_id: str) -> tuple[Path, Path]:
    try:
        normalized_id = str(UUID(upload_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Upload nicht gefunden.") from exc
    directory = (settings.storage_path / "chunk_uploads").resolve()
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{normalized_id}.part", directory / f"{normalized_id}.json"


def _load_chunk_upload(upload_id: str) -> tuple[dict[str, object], Path, Path]:
    part_path, metadata_path = _chunk_upload_paths(upload_id)
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=404, detail="Upload nicht gefunden oder abgelaufen.") from exc
    if metadata.get("owner_id") != current_user().id:
        raise HTTPException(status_code=404, detail="Upload nicht gefunden.")
    return metadata, part_path, metadata_path


@router.get("", response_model=list[ProjectResponse])
async def list_projects(session: Session = Depends(get_session)) -> list[Project]:
    user = current_user()
    # One-time migration for projects created before accounts existed on this
    # local installation. The first authenticated owner adopts those projects.
    legacy = list(session.scalars(select(Project).where(Project.owner_id.is_(None))))
    for project in legacy:
        project.owner_id = user.id
    if legacy:
        session.commit()
    projects = list(session.scalars(select(Project).where(Project.owner_id == user.id).order_by(Project.created_at.desc())))
    for project in projects:
        try:
            await upsert_project(project, user)
        except Exception:
            # Local editing stays available during a temporary Supabase outage;
            # the metadata is retried on the next project-list request.
            pass
    return projects


@router.post("/upload", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def upload_project(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> Project:
    original_name = Path(file.filename or "video").name[:255]
    extension = _video_extension(file, original_name)
    if not extension:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Bitte ein MP4-, M4V-, MOV-, MKV- oder WebM-Video auswählen.",
        )

    project_id = str(uuid4())
    stored_name = f"{project_id}{extension}"
    video_path = (settings.storage_path / "uploads" / stored_name).resolve()
    thumbnail_path = (settings.storage_path / "thumbnails" / f"{project_id}.jpg").resolve()
    total_bytes = 0
    saved = False

    try:
        async with aiofiles.open(video_path, "wb") as output:
            while chunk := await file.read(UPLOAD_CHUNK_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="The video file is larger than the 50 GB local limit.",
                    )
                await output.write(chunk)

        metadata = await asyncio.to_thread(inspect_video, video_path)
        if metadata.duration > MAX_DURATION_SECONDS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Videos können bis zu 8 Stunden lang sein.",
            )
        await asyncio.to_thread(create_thumbnail, video_path, thumbnail_path, metadata.duration)
        project = Project(
            id=project_id,
            owner_id=current_user().id,
            filename=stored_name,
            original_filename=original_name,
            status="Ready",
            duration=metadata.duration,
            width=metadata.width,
            height=metadata.height,
            fps=metadata.fps,
            codec=metadata.codec,
            thumbnail_path=str(thumbnail_path),
            video_path=str(video_path),
        )
        session.add(project)
        session.commit()
        session.refresh(project)
        try:
            await upsert_project(project, current_user())
        except Exception:
            pass
        saved = True
        return project
    except MediaInspectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    finally:
        await file.close()
        if not saved:
            video_path.unlink(missing_ok=True)
            thumbnail_path.unlink(missing_ok=True)


@router.post("/upload/init", status_code=status.HTTP_201_CREATED)
async def initialize_chunked_upload(payload: ChunkedUploadInit) -> dict[str, object]:
    original_name = Path(payload.filename).name[:255]
    extension = _video_extension_from_metadata(original_name, payload.content_type)
    if not extension:
        raise HTTPException(status_code=415, detail="Bitte ein MP4-, M4V-, MOV-, MKV- oder WebM-Video auswählen.")
    upload_id = str(uuid4())
    part_path, metadata_path = _chunk_upload_paths(upload_id)
    metadata = {
        "upload_id": upload_id,
        "owner_id": current_user().id,
        "original_name": original_name,
        "extension": extension,
        "size": payload.size,
        "chunk_size": PUBLIC_UPLOAD_CHUNK_BYTES,
        "received_offsets": [],
        "received_bytes": 0,
    }
    await asyncio.to_thread(part_path.touch, exist_ok=False)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
    return {"upload_id": upload_id, "received_bytes": 0, "chunk_size": PUBLIC_UPLOAD_CHUNK_BYTES}


@router.put("/upload/{upload_id}/chunk")
async def append_upload_chunk(
    upload_id: str,
    request: Request,
    offset: int = Query(ge=0),
) -> dict[str, int]:
    metadata, part_path, metadata_path = _load_chunk_upload(upload_id)
    body = await request.body()
    if not body or len(body) > PUBLIC_UPLOAD_CHUNK_LIMIT:
        raise HTTPException(status_code=413, detail="Upload-Block ist leer oder zu groß.")
    expected_size = int(metadata["size"])
    chunk_size = int(metadata.get("chunk_size") or PUBLIC_UPLOAD_CHUNK_BYTES)
    expected_chunk_size = min(chunk_size, expected_size - offset)
    if offset >= expected_size or offset % chunk_size != 0 or len(body) != expected_chunk_size:
        raise HTTPException(status_code=413, detail="Die Upload-Blockgröße oder Position ist ungültig.")
    lock = _chunk_upload_locks.setdefault(upload_id, asyncio.Lock())
    async with lock:
        # Reload under the upload lock because several blocks can arrive at the
        # same time. Each block is written at its own offset, which lets modern
        # browsers use three parallel connections instead of waiting for every
        # 8 MB round trip sequentially.
        metadata, part_path, metadata_path = _load_chunk_upload(upload_id)
        received_offsets = {int(value) for value in metadata.get("received_offsets", [])}
        received_bytes = int(metadata.get("received_bytes") or 0)
        if offset in received_offsets:
            return {"received_bytes": received_bytes}
        if received_bytes + len(body) > expected_size or received_bytes + len(body) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Die Upload-Größe stimmt nicht mit der Datei überein.")
        async with aiofiles.open(part_path, "r+b") as output:
            await output.seek(offset)
            await output.write(body)
        received_offsets.add(offset)
        received_bytes += len(body)
        metadata["received_offsets"] = sorted(received_offsets)
        metadata["received_bytes"] = received_bytes
        metadata_path.write_text(json.dumps(metadata, ensure_ascii=False), encoding="utf-8")
        return {"received_bytes": received_bytes}


@router.post("/upload/{upload_id}/complete", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def complete_chunked_upload(
    upload_id: str,
    session: Session = Depends(get_session),
) -> Project:
    metadata, part_path, metadata_path = _load_chunk_upload(upload_id)
    expected_size = int(metadata["size"])
    chunk_size = int(metadata.get("chunk_size") or PUBLIC_UPLOAD_CHUNK_BYTES)
    expected_offsets = set(range(0, expected_size, chunk_size))
    received_offsets = {int(value) for value in metadata.get("received_offsets", [])}
    received = int(metadata.get("received_bytes") or 0)
    if (
        not part_path.is_file()
        or part_path.stat().st_size != expected_size
        or received != expected_size
        or received_offsets != expected_offsets
    ):
        raise HTTPException(status_code=409, detail={"received_bytes": received, "expected_bytes": expected_size})
    project_id = str(uuid4())
    extension = str(metadata["extension"])
    original_name = str(metadata["original_name"])
    video_path = (settings.storage_path / "uploads" / f"{project_id}{extension}").resolve()
    thumbnail_path = (settings.storage_path / "thumbnails" / f"{project_id}.jpg").resolve()
    saved = False
    try:
        await asyncio.to_thread(part_path.replace, video_path)
        media = await asyncio.to_thread(inspect_video, video_path)
        if media.duration > MAX_DURATION_SECONDS:
            raise HTTPException(status_code=422, detail="Videos können bis zu 8 Stunden lang sein.")
        await asyncio.to_thread(create_thumbnail, video_path, thumbnail_path, media.duration)
        project = Project(
            id=project_id,
            owner_id=current_user().id,
            filename=video_path.name,
            original_filename=original_name,
            status="Ready",
            duration=media.duration,
            width=media.width,
            height=media.height,
            fps=media.fps,
            codec=media.codec,
            thumbnail_path=str(thumbnail_path),
            video_path=str(video_path),
        )
        session.add(project)
        session.commit()
        session.refresh(project)
        try:
            await upsert_project(project, current_user())
        except Exception:
            pass
        saved = True
        return project
    except MediaInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        metadata_path.unlink(missing_ok=True)
        _chunk_upload_locks.pop(upload_id, None)
        if not saved:
            part_path.unlink(missing_ok=True)
            video_path.unlink(missing_ok=True)
            thumbnail_path.unlink(missing_ok=True)


def _get_project(project_id: str, session: Session) -> Project:
    try:
        UUID(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    project = session.scalar(select(Project).where(Project.id == project_id, Project.owner_id == current_user().id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, session: Session = Depends(get_session)) -> Project:
    return _get_project(project_id, session)


@router.get("/{project_id}/reference", response_model=ReferenceStyleResponse)
def get_reference_style(project_id: str, session: Session = Depends(get_session)) -> ReferenceStyleResponse:
    project = _get_project(project_id, session)
    profile_path = (settings.storage_path / "references" / f"{project.id}.json").resolve()
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="No style reference has been analyzed yet.")
    try:
        payload = json.loads(profile_path.read_text(encoding="utf-8"))
        if "style_summary" not in payload:
            references = sorted(
                (path for path in profile_path.parent.glob(f"{project.id}-*") if path.suffix.lower() in ALLOWED_EXTENSIONS),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
            if references:
                payload = {"filename": payload.get("filename", references[0].name), **analyze_reference_style(references[0])}
                profile_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return ReferenceStyleResponse(**payload)
    except (OSError, ValueError, TypeError, json.JSONDecodeError, MediaInspectionError) as exc:
        raise HTTPException(status_code=422, detail=f"Stored style analysis could not be restored: {exc}") from exc


@router.post("/{project_id}/reference", response_model=ReferenceStyleResponse)
async def upload_reference_video(
    project_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> ReferenceStyleResponse:
    project = _get_project(project_id, session)
    original_name = Path(file.filename or "reference-video").name[:255]
    extension = _video_extension(file, original_name)
    if not extension:
        raise HTTPException(status_code=415, detail="Bitte ein MP4-, M4V-, MOV-, MKV- oder WebM-Video auswählen.")
    reference_path = (settings.storage_path / "references" / f"{project.id}-{uuid4().hex[:8]}{extension}").resolve()
    profile_path = (settings.storage_path / "references" / f"{project.id}.json").resolve()
    total_bytes = 0
    saved = False
    try:
        async with aiofiles.open(reference_path, "wb") as output:
            while chunk := await file.read(UPLOAD_CHUNK_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="The reference video is larger than the 50 GB local limit.")
                await output.write(chunk)
        profile = analyze_reference_style(reference_path)
        payload = {"filename": original_name, **profile}
        profile_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        saved = True
        return ReferenceStyleResponse(**payload)
    except MediaInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        await file.close()
        if not saved:
            reference_path.unlink(missing_ok=True)


@router.post("/{project_id}/reaction", response_model=ReactionSyncResponse)
async def upload_reaction_video(
    project_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> ReactionSyncResponse:
    project = _get_project(project_id, session)
    original_name = Path(file.filename or "reaction-video").name[:255]
    extension = _video_extension(file, original_name)
    if not extension:
        raise HTTPException(status_code=415, detail="Bitte ein MP4-, M4V-, MOV-, MKV- oder WebM-Reaction-Video auswählen.")
    reaction_path = (settings.storage_path / "reactions" / f"{project.id}-{uuid4().hex[:8]}{extension}").resolve()
    profile_path = (settings.storage_path / "reactions" / f"{project.id}.json").resolve()
    saved = False
    total_bytes = 0
    try:
        async with aiofiles.open(reaction_path, "wb") as output:
            while chunk := await file.read(UPLOAD_CHUNK_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="The reaction video is larger than the 50 GB local limit.")
                await output.write(chunk)
        # ffprobe and the full audio correlation are CPU/process-heavy. Running
        # them off the async event loop keeps the API responsive while large
        # files are compared and prevents the browser connection from dropping.
        metadata = await asyncio.to_thread(inspect_video, reaction_path)
        offset, confidence = await asyncio.to_thread(
            synchronize_reaction, Path(project.video_path), reaction_path
        )
        payload = {"filename": original_name, "path": str(reaction_path), "duration": metadata.duration, "width": metadata.width, "height": metadata.height, "offset_seconds": offset, "confidence": confidence}
        profile_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        saved = True
        return ReactionSyncResponse(**payload)
    except MediaInspectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        await file.close()
        if not saved:
            reaction_path.unlink(missing_ok=True)


@router.get("/{project_id}/reaction", response_model=ReactionSyncResponse)
def get_reaction_video(
    project_id: str,
    session: Session = Depends(get_session),
) -> ReactionSyncResponse:
    project = _get_project(project_id, session)
    profile_path = (settings.storage_path / "reactions" / f"{project.id}.json").resolve()
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="Noch kein Reaction-Video synchronisiert.")
    try:
        payload = json.loads(profile_path.read_text(encoding="utf-8"))
        candidate = Path(str(payload.get("path", ""))).resolve()
        if not candidate.is_file():
            raise OSError("Reaction-Datei fehlt")
        return ReactionSyncResponse(**payload)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Gespeicherte Reaction konnte nicht geladen werden.") from exc


@router.get("/{project_id}/reaction/media")
def stream_reaction_video(project_id: str, session: Session = Depends(get_session)) -> FileResponse:
    project = _get_project(project_id, session)
    profile_path = (settings.storage_path / "reactions" / f"{project.id}.json").resolve()
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="Noch kein Reaction-Video synchronisiert.")
    try:
        candidate = Path(str(json.loads(profile_path.read_text(encoding="utf-8")).get("path", ""))).resolve()
        if not candidate.is_file():
            raise OSError("Reaction-Datei fehlt")
        return FileResponse(candidate, media_type="video/mp4", filename=candidate.name)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=404, detail="Reaction-Datei nicht verfügbar.") from exc


@router.get("/{project_id}/frame/media")
def stream_frame_image(project_id: str, session: Session = Depends(get_session)) -> FileResponse:
    project = _get_project(project_id, session)
    profile_path = (settings.storage_path / "frames" / f"{project.id}.json").resolve()
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="Noch kein Rahmen gespeichert.")
    try:
        candidate = Path(str(json.loads(profile_path.read_text(encoding="utf-8")).get("path", ""))).resolve()
        if not candidate.is_file():
            raise OSError("Rahmen-Datei fehlt")
        return FileResponse(candidate)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=404, detail="Rahmen nicht verfügbar.") from exc


@router.patch("/{project_id}/reaction", response_model=ReactionSyncResponse)
def update_reaction_offset(
    project_id: str,
    update: ReactionOffsetUpdate,
    session: Session = Depends(get_session),
) -> ReactionSyncResponse:
    project = _get_project(project_id, session)
    profile_path = (settings.storage_path / "reactions" / f"{project.id}.json").resolve()
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="Noch kein Reaction-Video synchronisiert.")
    try:
        payload = json.loads(profile_path.read_text(encoding="utf-8"))
        if not Path(str(payload.get("path", ""))).resolve().is_file():
            raise OSError("Reaction-Datei fehlt")
        payload["offset_seconds"] = round(update.offset_seconds, 3)
        payload["confidence"] = 100.0
        profile_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return ReactionSyncResponse(**payload)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Gespeicherte Reaction konnte nicht geladen werden.") from exc


@router.post("/{project_id}/frame")
async def upload_reaction_frame(
    project_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    project = _get_project(project_id, session)
    original_name = Path(file.filename or "frame.png").name[:255]
    extension = Path(original_name).suffix.lower()
    if extension not in {".png", ".webp"}:
        raise HTTPException(status_code=415, detail="Bitte einen transparenten PNG- oder WebP-Rahmen auswählen.")
    frame_dir = (settings.storage_path / "frames").resolve()
    frame_dir.mkdir(parents=True, exist_ok=True)
    frame_path = (frame_dir / f"{project.id}{extension}").resolve()
    data = await file.read(20 * 1024 * 1024 + 1)
    await file.close()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Der Rahmen darf höchstens 20 MB groß sein.")
    is_png = data.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if not ((extension == ".png" and is_png) or (extension == ".webp" and is_webp)):
        raise HTTPException(status_code=422, detail="Die Rahmendatei ist beschädigt oder hat das falsche Format.")
    async with aiofiles.open(frame_path, "wb") as output:
        await output.write(data)
    profile_path = (frame_dir / f"{project.id}.json").resolve()
    profile_path.write_text(json.dumps({"filename": original_name, "path": str(frame_path)}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"filename": original_name, "frame_url": f"/api/projects/{project.id}/frame"}


@router.get("/{project_id}/frame")
def get_reaction_frame(project_id: str, session: Session = Depends(get_session)) -> FileResponse:
    project = _get_project(project_id, session)
    profile_path = (settings.storage_path / "frames" / f"{project.id}.json").resolve()
    if not profile_path.is_file():
        raise HTTPException(status_code=404, detail="No custom frame")
    try:
        candidate = Path(str(json.loads(profile_path.read_text(encoding="utf-8")).get("path", ""))).resolve()
    except (OSError, json.JSONDecodeError):
        raise HTTPException(status_code=404, detail="No custom frame")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="No custom frame")
    return FileResponse(candidate)


def _transcript_response(transcript: Transcript) -> TranscriptResponse:
    return TranscriptResponse(
        id=transcript.id,
        project_id=transcript.project_id,
        language=transcript.language,
        full_text=transcript.full_text,
        segments=json.loads(transcript.segments_json),
        created_at=transcript.created_at,
    )


@router.get("/{project_id}/transcript", response_model=TranscriptResponse)
def get_transcript(project_id: str, session: Session = Depends(get_session)) -> TranscriptResponse:
    _get_project(project_id, session)
    transcript = session.scalar(select(Transcript).where(Transcript.project_id == project_id))
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not created yet")
    return _transcript_response(transcript)


@router.post("/{project_id}/transcribe", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
def start_transcription(project_id: str, session: Session = Depends(get_session)) -> JobResponse:
    project = _get_project(project_id, session)
    job = job_manager.submit(
        project.id,
        "transcription",
        lambda progress: transcribe_video(project.id, Path(project.video_path), progress),
        unique_key=f"transcription:{project.id}",
    )
    return JobResponse.model_validate(job, from_attributes=True)


@router.get("/{project_id}/clips", response_model=list[ClipResponse])
def get_clips(project_id: str, session: Session = Depends(get_session)) -> list[Clip]:
    _get_project(project_id, session)
    return list(session.scalars(select(Clip).where(Clip.project_id == project_id).order_by(Clip.start.asc())))


@router.post("/{project_id}/headline-suggestions", response_model=HeadlineSuggestionResponse)
def suggest_headlines(
    project_id: str,
    request: HeadlineSuggestionRequest,
    session: Session = Depends(get_session),
) -> HeadlineSuggestionResponse:
    project = _get_project(project_id, session)
    if request.end <= request.start or request.end > (project.duration or 0) + 0.01:
        raise HTTPException(status_code=422, detail="Der gewählte Bereich ist ungültig.")
    transcript = session.scalar(select(Transcript).where(Transcript.project_id == project.id))
    if not transcript:
        raise HTTPException(status_code=422, detail="Für KI-Titel muss zuerst ein Transkript erstellt werden.")
    segments = json.loads(transcript.segments_json)
    text = " ".join(
        str(segment.get("text", "")).strip()
        for segment in segments
        if float(segment.get("end", 0)) > request.start and float(segment.get("start", 0)) < request.end
    ).strip()
    main_headline, reaction_headline = generate_dual_headlines(text or transcript.full_text, request.platform)
    return HeadlineSuggestionResponse(main_headline=main_headline, reaction_headline=reaction_headline)


@router.post("/{project_id}/auto-cut", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
def start_auto_cut(project_id: str, request: AutoCutRequest, session: Session = Depends(get_session)) -> JobResponse:
    project = _get_project(project_id, session)

    def task(progress):
        with SessionLocal() as worker_session:
            existing = worker_session.scalar(select(Transcript).where(Transcript.project_id == project.id))
        if not existing:
            transcribe_video(project.id, Path(project.video_path), lambda value, message: progress(value * 0.78, message))
        return analyze_best_clips(project.id, lambda value, message: progress(78 + value * 0.22, message), request.platform)

    job = job_manager.submit(project.id, "auto_cut", task, unique_key=f"auto-cut:{project.id}:{request.platform}")
    return JobResponse.model_validate(job, from_attributes=True)


@router.get("/{project_id}/thumbnail")
def get_thumbnail(project_id: str, session: Session = Depends(get_session)) -> FileResponse:
    project = _get_project(project_id, session)
    path = Path(project.thumbnail_path or "")
    if not project.thumbnail_path or not path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(path, media_type="image/jpeg", filename=f"{project.id}.jpg")


@router.get("/{project_id}/media")
def get_media(project_id: str, session: Session = Depends(get_session)) -> FileResponse:
    project = _get_project(project_id, session)
    path = Path(project.video_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Video not found")
    media_types = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
    }
    return FileResponse(path, media_type=media_types.get(path.suffix.lower(), "video/mp4"))


@router.post("/{project_id}/preview", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
def start_preview(project_id: str, session: Session = Depends(get_session)) -> JobResponse:
    project = _get_project(project_id, session)
    video_path = Path(project.video_path)
    playlist = (settings.storage_path / "previews" / project.id / "index.m3u8").resolve()

    def task(progress):
        if playlist.is_file() and "#EXT-X-ENDLIST" in playlist.read_text(encoding="utf-8", errors="ignore"):
            return {"preview_url": f"/api/projects/{project.id}/preview/index.m3u8"}
        return create_hls_preview(project.id, video_path, project.duration or 0, progress)

    job = job_manager.submit(project.id, "preview", task, unique_key=f"preview:{project.id}")
    return JobResponse.model_validate(job, from_attributes=True)


@router.get("/{project_id}/preview/{asset}", response_model=None)
def get_preview_asset(
    project_id: str,
    asset: str,
    media_token: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> Response:
    project = _get_project(project_id, session)
    if asset != "index.m3u8" and not re.fullmatch(r"segment_\d{5}\.ts", asset):
        raise HTTPException(status_code=404, detail="Preview asset not found")
    preview_root = (settings.storage_path / "previews" / project.id).resolve()
    asset_path = (preview_root / asset).resolve()
    if asset_path.parent != preview_root or not asset_path.is_file():
        raise HTTPException(status_code=404, detail="Preview asset not ready")
    media_type = "application/vnd.apple.mpegurl" if asset.endswith(".m3u8") else "video/mp2t"
    if asset.endswith(".m3u8") and media_token:
        playlist = asset_path.read_text(encoding="utf-8")
        playlist = re.sub(
            r"(?m)^(segment_\d{5}\.ts)$",
            rf"\1?media_token={media_token}",
            playlist,
        )
        return Response(playlist, media_type=media_type, headers={"Cache-Control": "no-cache"})
    response = FileResponse(asset_path, media_type=media_type)
    response.headers["Cache-Control"] = "no-cache" if asset.endswith(".m3u8") else "public, max-age=31536000, immutable"
    return response


@router.get("/{project_id}/timeline/{index}")
def get_timeline_frame(project_id: str, index: int, session: Session = Depends(get_session)) -> FileResponse:
    project = _get_project(project_id, session)
    if index < 0 or index > 7:
        raise HTTPException(status_code=404, detail="Timeline frame not found")
    output_path = (settings.storage_path / "timeline" / f"{project.id}-{index}.jpg").resolve()
    if not output_path.is_file():
        timestamp = (project.duration or 0) * (index + 0.5) / 8
        create_timeline_frame(Path(project.video_path), output_path, timestamp)
    return FileResponse(output_path, media_type="image/jpeg")


@router.post("/{project_id}/render", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
def render_project_clip(
    project_id: str,
    request: RenderRequest,
    session: Session = Depends(get_session),
) -> JobResponse:
    project = _get_project(project_id, session)
    if request.end <= request.start + 0.1:
        raise HTTPException(status_code=422, detail="The clip must be at least 0.1 seconds long")
    if request.end > (project.duration or 0) + 0.01:
        raise HTTPException(status_code=422, detail="The selected range is outside the video")
    transcript_segments = None
    if request.captions:
        transcript = session.scalar(select(Transcript).where(Transcript.project_id == project.id))
        if not transcript:
            raise HTTPException(status_code=422, detail="Create a transcript before exporting captions")
        transcript_segments = json.loads(transcript.segments_json)
    reaction_path = None
    reaction_offset = 0.0
    font_family = request.font_family
    if font_family == "auto":
        style_profile = (settings.storage_path / "references" / f"{project.id}.json").resolve()
        try:
            font_family = str(json.loads(style_profile.read_text(encoding="utf-8")).get("recommended_font", "Anton")) if style_profile.is_file() else "Anton"
        except (OSError, json.JSONDecodeError):
            font_family = "Anton"
    reaction_profile = (settings.storage_path / "reactions" / f"{project.id}.json").resolve()
    if request.include_reaction and reaction_profile.is_file():
        try:
            reaction_data = json.loads(reaction_profile.read_text(encoding="utf-8"))
            candidate = Path(str(reaction_data.get("path", ""))).resolve()
            if candidate.is_file():
                reaction_path = candidate
                reaction_offset = float(reaction_data.get("offset_seconds", 0))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            reaction_path = None
    frame_path = None
    frame_profile = (settings.storage_path / "frames" / f"{project.id}.json").resolve()
    if request.include_reaction and frame_profile.is_file():
        try:
            frame_candidate = Path(
                str(json.loads(frame_profile.read_text(encoding="utf-8")).get("path", ""))
            ).resolve()
            if frame_candidate.is_file():
                frame_path = frame_candidate
        except (OSError, json.JSONDecodeError):
            frame_path = None
    # Resolve request-scoped identity before the job moves to its worker
    # thread. Context variables are deliberately unavailable there.
    user = current_user()
    social_safe_layout = request.social_safe_layout and settings.is_owner(user.id, user.email)
    job = job_manager.submit(
        project.id,
        "render",
        lambda progress: render_vertical_clip(
            project.id,
            Path(project.video_path),
            request.start,
            request.end,
            request.mode,
            request.fps,
            request.filename,
            progress,
            transcript_segments,
            request.caption_style,
            request.caption_uppercase,
            request.words_per_caption,
            request.caption_animation,
            request.caption_x,
            request.caption_y,
            request.caption_size,
            request.platform,
            request.layout,
            request.headline,
            reaction_path,
            reaction_offset,
            font_family,
            request.headline_style,
            request.headline_position,
            request.headline_size,
            request.headline_font,
            request.headline_text_color,
            request.headline_background_color,
            request.headline_x,
            request.headline_y,
            request.secondary_headline,
            request.secondary_headline_x,
            request.secondary_headline_y,
            request.blur_strength,
            request.background_dim,
            request.main_x,
            request.main_y,
            request.main_scale,
            request.reaction_x,
            request.reaction_y,
            request.reaction_scale,
            request.frame_x,
            request.frame_y,
            request.frame_scale,
            social_safe_layout,
            request.main_format,
            frame_path,
        ),
    )
    return JobResponse.model_validate(job, from_attributes=True)
