from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from backend.app.core.auth import AuthenticatedUser, get_current_user
from backend.app.services.presence import record_presence


router = APIRouter(prefix="/presence", tags=["presence"])


class PresenceHeartbeat(BaseModel):
    page: str = Field(default="/", max_length=240)


@router.post("/heartbeat")
def heartbeat(
    payload: PresenceHeartbeat,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, object]:
    return record_presence(user, request, payload.page)
