import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.router import api_router
from backend.app.core.config import settings
from backend.app.core.database import init_database
from backend.app.services.presence import prune_expired_presence


async def _presence_cleanup_loop() -> None:
    while True:
        await asyncio.sleep(3600)
        await asyncio.to_thread(prune_expired_presence)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    settings.ensure_directories()
    prune_expired_presence()
    cleanup_task = asyncio.create_task(_presence_cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task


app = FastAPI(
    title="ClipForge Cutter API",
    description="Authenticated video processing services for ClipForge Cutter.",
    version="0.1.2",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api")
