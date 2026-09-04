from fastapi import APIRouter

from backend.app.api.routes import examples, health, jobs, owner, presence, projects, settings

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(examples.router)
api_router.include_router(projects.router)
api_router.include_router(settings.router)
api_router.include_router(jobs.router)
api_router.include_router(owner.router)
api_router.include_router(presence.router)
