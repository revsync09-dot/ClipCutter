from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backend.app.core.config import settings
from backend.app.core.auth import current_user, get_current_user
from backend.app.core.database import SessionLocal
from backend.app.models import Project
from backend.app.schemas.jobs import JobResponse
from backend.app.services.jobs import job_manager

router = APIRouter(prefix="/jobs", tags=["jobs"], dependencies=[Depends(get_current_user)])


def _require_project_owner(project_id: str) -> None:
    with SessionLocal() as session:
        project = session.get(Project, project_id)
        if not project or project.owner_id != current_user().id:
            raise HTTPException(status_code=404, detail="Job not found")


@router.get("/output/{filename}")
def get_output(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    if safe_name != filename or not safe_name.lower().endswith(".mp4"):
        raise HTTPException(status_code=404, detail="Export not found")
    output_path = (settings.storage_path / "outputs" / safe_name).resolve()
    if not output_path.is_file() or output_path.parent != (settings.storage_path / "outputs").resolve():
        raise HTTPException(status_code=404, detail="Export not found")
    job = job_manager.find_by_output(f"/api/jobs/output/{safe_name}")
    if not job:
        raise HTTPException(status_code=404, detail="Export not found")
    _require_project_owner(job.project_id)
    return FileResponse(output_path, media_type="video/mp4", filename=safe_name)


@router.get("/{job_id}", response_model=JobResponse)
def get_job(job_id: str) -> JobResponse:
    job = job_manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    _require_project_owner(job.project_id)
    return JobResponse.model_validate(job, from_attributes=True)
