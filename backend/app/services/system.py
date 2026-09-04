import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

import httpx

from backend.app.core.config import settings

from backend.app.schemas.system import SystemStatus, ToolStatus


def _winget_binary(name: str) -> str | None:
    local_app_data = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
    candidates = sorted(local_app_data.glob(f"Gyan.FFmpeg_*/*/bin/{name}.exe"))
    return str(candidates[-1]) if candidates else None


def _tool_status(command: str, version_args: list[str]) -> ToolStatus:
    executable = shutil.which(command) or _winget_binary(command)
    if not executable:
        return ToolStatus(available=False, detail=f"{command} was not found")
    try:
        result = subprocess.run(
            [executable, *version_args],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        first_line = (result.stdout or result.stderr).splitlines()[0]
        return ToolStatus(available=result.returncode == 0, version=first_line)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return ToolStatus(available=False, detail=str(exc))


def _gpu_available() -> bool:
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except (ImportError, RuntimeError):
        return shutil.which("nvidia-smi") is not None


def _ollama_status() -> ToolStatus:
    executable = shutil.which("ollama")
    if not executable:
        return ToolStatus(available=False, detail="Ollama is not installed")
    try:
        response = httpx.get(f"{settings.ollama_url}/api/version", timeout=2)
        response.raise_for_status()
        return ToolStatus(available=True, version=response.json().get("version"))
    except (httpx.HTTPError, ValueError):
        return ToolStatus(
            available=False,
            detail="Ollama is installed, but its local service is not running",
        )


def get_system_status() -> SystemStatus:
    whisper_installed = importlib.util.find_spec("faster_whisper") is not None
    return SystemStatus(
        ffmpeg=_tool_status("ffmpeg", ["-version"]),
        ffprobe=_tool_status("ffprobe", ["-version"]),
        ollama=_ollama_status(),
        whisper=ToolStatus(
            available=whisper_installed,
            detail="faster-whisper package installed" if whisper_installed else "Package missing",
        ),
        gpu_detected=_gpu_available(),
        python_version=sys.version.split()[0],
    )
