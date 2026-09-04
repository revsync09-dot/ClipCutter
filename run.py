"""Start the ClipForge Cutter backend and frontend together on Windows."""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import time
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
VENV_PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
FRONTEND = ROOT / "frontend"


def port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def require_environment() -> None:
    missing: list[str] = []
    if not VENV_PYTHON.exists():
        missing.append("Python environment (.venv)")
    if not (FRONTEND / "node_modules").exists():
        missing.append("frontend packages")
    if not (shutil.which("npm.cmd") or shutil.which("npm")):
        missing.append("npm")
    if missing:
        print("Setup is incomplete: " + ", ".join(missing))
        print(r"Run: powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1")
        raise SystemExit(1)


def stop_media_workers() -> None:
    storage_marker = str((ROOT / "backend" / "storage").resolve()).lower()
    helper = (
        "import psutil,sys; marker=sys.argv[1]; workers=[]; "
        "[(p.terminate(),workers.append(p)) for p in psutil.process_iter(['name','cmdline']) "
        "if (p.info.get('name') or '').lower()=='ffmpeg.exe' "
        "and marker in ' '.join(p.info.get('cmdline') or []).lower()]; "
        "gone,alive=psutil.wait_procs(workers,timeout=3); [p.kill() for p in alive]"
    )
    subprocess.run(
        [str(VENV_PYTHON), "-c", helper, storage_marker],
        capture_output=True,
        check=False,
    )


def main() -> None:
    require_environment()
    api_port = int(os.getenv("CLIPFORGE_API_PORT", "8000"))
    frontend_port = int(os.getenv("CLIPFORGE_FRONTEND_PORT", "5173"))
    if not port_available(api_port) or not port_available(frontend_port):
        print("ClipForge ports are already in use. Stop the existing app and retry.")
        raise SystemExit(1)

    # Vinext can leave this development lock behind after Ctrl+C on Windows.
    # Ports are free at this point, so it cannot belong to a running server.
    (FRONTEND / ".vinext" / "dev" / "lock.json").unlink(missing_ok=True)

    creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    backend = subprocess.Popen(
        [str(VENV_PYTHON), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", str(api_port)],
        cwd=ROOT,
        creationflags=creation_flags,
    )
    npm = shutil.which("npm.cmd") or shutil.which("npm") or "npm"
    # Serve the verified production build. Vinext's development optimizer can
    # stall on large editor dependency graphs and is unnecessary for users.
    frontend = subprocess.Popen(
        [npm, "run", "start", "--", "--hostname", "127.0.0.1", "--port", str(frontend_port)],
        cwd=FRONTEND,
        creationflags=creation_flags,
    )
    processes = [backend, frontend]
    url = f"http://localhost:{frontend_port}"
    print("\nClipForge Cutter is starting")
    print(f"  Editor: {url}")
    print(f"  Local API: http://127.0.0.1:{api_port}/docs")
    print("Press Ctrl+C to stop both services.\n")

    if os.getenv("CLIPFORGE_OPEN_BROWSER", "true").lower() in {"1", "true", "yes"}:
        time.sleep(2)
        webbrowser.open(url)
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            if process.poll() is None:
                if os.name == "nt":
                    process.send_signal(signal.CTRL_BREAK_EVENT)
                else:
                    process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        stop_media_workers()


if __name__ == "__main__":
    main()
