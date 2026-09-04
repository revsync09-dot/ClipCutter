from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{settings.database_path.as_posix()}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_database() -> None:
    settings.ensure_directories()
    from backend.app.models import entities  # noqa: F401

    Base.metadata.create_all(bind=engine)
    # Lightweight Version 1 migration for databases created before upload metadata.
    with engine.begin() as connection:
        columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(projects)"))
        }
        if "codec" not in columns:
            connection.execute(text("ALTER TABLE projects ADD COLUMN codec VARCHAR(64)"))
        if "owner_id" not in columns:
            connection.execute(text("ALTER TABLE projects ADD COLUMN owner_id VARCHAR(36)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at)")
        )
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id)"))
        connection.execute(text("PRAGMA optimize"))


def get_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
