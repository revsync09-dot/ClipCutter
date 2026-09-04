from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from threading import Lock
from typing import Callable
from uuid import uuid4


ProgressCallback = Callable[[float, str], None]
JobTask = Callable[[ProgressCallback], dict[str, str | None]]


@dataclass
class JobState:
    id: str
    project_id: str
    kind: str
    status: str = "queued"
    progress: float = 0
    message: str = "Waiting to start"
    error: str | None = None
    output_url: str | None = None
    preview_url: str | None = None


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, JobState] = {}
        self._active_keys: dict[str, str] = {}
        self._lock = Lock()
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="clipforge")

    def submit(self, project_id: str, kind: str, task: JobTask, unique_key: str | None = None) -> JobState:
        with self._lock:
            if unique_key and (existing_id := self._active_keys.get(unique_key)):
                existing = self._jobs.get(existing_id)
                if existing and existing.status in {"queued", "processing"}:
                    return existing
            job = JobState(id=str(uuid4()), project_id=project_id, kind=kind)
            self._jobs[job.id] = job
            if unique_key:
                self._active_keys[unique_key] = job.id
        self._executor.submit(self._run, job.id, unique_key, task)
        return job

    def _run(self, job_id: str, unique_key: str | None, task: JobTask) -> None:
        self._update(job_id, status="processing", message="Processing")

        def progress(value: float, message: str) -> None:
            self._update(job_id, progress=max(0, min(99, value)), message=message)

        try:
            result = task(progress)
            self._update(job_id, status="completed", progress=100, message="Complete", **result)
        except Exception as exc:  # worker boundary: error is returned to the UI
            self._update(job_id, status="failed", error=str(exc), message="Processing failed")
        finally:
            if unique_key:
                with self._lock:
                    if self._active_keys.get(unique_key) == job_id:
                        self._active_keys.pop(unique_key, None)

    def _update(self, job_id: str, **changes: object) -> None:
        with self._lock:
            job = self._jobs[job_id]
            for key, value in changes.items():
                setattr(job, key, value)

    def get(self, job_id: str) -> JobState | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return JobState(**asdict(job)) if job else None

    def find_by_output(self, output_url: str) -> JobState | None:
        with self._lock:
            job = next((item for item in self._jobs.values() if item.output_url == output_url), None)
            return JobState(**asdict(job)) if job else None


job_manager = JobManager()
