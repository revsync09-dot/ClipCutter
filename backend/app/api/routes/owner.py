from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.auth import current_user, get_current_user
from backend.app.core.config import settings
from backend.app.core.database import get_session
from backend.app.models import Clip, Project, Transcript


router = APIRouter(prefix="/owner", tags=["owner"], dependencies=[Depends(get_current_user)])


def _require_owner() -> None:
    user = current_user()
    if not settings.is_owner(user.id, user.email):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/me")
def owner_identity() -> dict[str, bool]:
    _require_owner()
    return {"is_owner": True}


@router.get("/overview")
def owner_overview(session: Session = Depends(get_session)) -> dict[str, object]:
    _require_owner()
    project_count = session.scalar(select(func.count()).select_from(Project)) or 0
    clip_count = session.scalar(select(func.count()).select_from(Clip)) or 0
    transcript_count = session.scalar(select(func.count()).select_from(Transcript)) or 0
    total_duration = session.scalar(select(func.coalesce(func.sum(Project.duration), 0))) or 0
    outputs = list((settings.storage_path / "outputs").glob("*.mp4"))
    recent = list(session.scalars(select(Project).order_by(Project.created_at.desc()).limit(8)))
    return {
        "projects": project_count,
        "clips": clip_count,
        "transcripts": transcript_count,
        "total_duration": round(float(total_duration), 1),
        "exports": len(outputs),
        "export_bytes": sum(path.stat().st_size for path in outputs if path.is_file()),
        "recent_projects": [
            {"id": project.id, "name": project.original_filename, "status": project.status, "created_at": project.created_at}
            for project in recent
        ],
    }
