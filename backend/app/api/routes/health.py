from fastapi import APIRouter

from backend.app.schemas.system import HealthResponse, SystemStatus
from backend.app.services.system import get_system_status

router = APIRouter(tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="ClipForge Cutter", version="0.1.2")


@router.get("/system/status", response_model=SystemStatus)
def system_status() -> SystemStatus:
    return get_system_status()
