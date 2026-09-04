import httpx

from backend.app.core.auth import AuthenticatedUser
from backend.app.core.config import settings
from backend.app.models import Project


async def upsert_project(project: Project, user: AuthenticatedUser) -> None:
    """Mirror durable project metadata to Supabase; video bytes remain local."""
    payload = {
        "id": project.id,
        "owner_id": user.id,
        "name": project.original_filename,
        "original_filename": project.original_filename,
        "status": project.status.lower(),
        "duration_seconds": project.duration,
        "width": project.width,
        "height": project.height,
        "fps": project.fps,
        "codec": project.codec,
        "selected_start": 0,
        "selected_end": project.duration,
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{settings.supabase_url.rstrip('/')}/rest/v1/projects?on_conflict=id",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {user.access_token}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=payload,
        )
    response.raise_for_status()
