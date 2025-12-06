import asyncio
import base64
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Dict, Optional
from uuid import uuid4
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import uvicorn


# ---------------------------------------------------------------------------
# Environment & paths
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
MEIPASS_DIR = Path(getattr(sys, "_MEIPASS", BASE_DIR))
ASSETS_ROOT = MEIPASS_DIR if MEIPASS_DIR.exists() else PROJECT_ROOT
ASR_DIR = (ASSETS_ROOT / "asr") if (ASSETS_ROOT / "asr").exists() else (PROJECT_ROOT / "asr")

DEFAULT_ENGINE = os.environ.get("ASR_ENGINE", "funasr").lower()
DEFAULT_MODEL = os.environ.get("ASR_MODEL", "funasr-paraformer")


def resolve_python_cmd() -> str:
    env_py = os.environ.get("ASR_PYTHON_PATH")
    if env_py and Path(env_py).exists():
        return env_py

    # Prefer the current interpreter if available
    if sys.executable and Path(sys.executable).exists():
        return sys.executable

    return "python.exe" if sys.platform.startswith("win") else "python3"


class WorkerBridge:
    """
    Thin bridge that keeps the existing stdin/stdout workers (asr_worker.py / asr_funasr_worker.py)
    and exposes them over WebSocket via FastAPI.
    """

    def __init__(self, engine: str, model: str):
        self.engine = engine
        self.model = model
        self.process: Optional[asyncio.subprocess.Process] = None
        self.stdout_task: Optional[asyncio.Task] = None
        self.ready_event = asyncio.Event()
        self.ws_clients: Dict[str, WebSocket] = {}
        self.pending_requests: Dict[str, asyncio.Future] = {}

    def _worker_path(self) -> Path:
        if self.engine == "funasr":
            return ASR_DIR / "asr_funasr_worker.py"
        return ASR_DIR / "asr_worker.py"

    async def start(self):
        if self.process:
            return

        worker_path = self._worker_path()
        if not worker_path.exists():
            raise FileNotFoundError(f"Worker script not found: {worker_path}")

        env = os.environ.copy()
        env.update(
            {
                "PYTHONUNBUFFERED": "1",
                "ASR_MODEL": self.model,
                "ASR_ENGINE": self.engine,
                # align ModelScope cache with ASR cache to avoid global locks
                "MODELSCOPE_CACHE": os.environ.get("MODELSCOPE_CACHE"),
                "MODELSCOPE_CACHE_HOME": os.environ.get("MODELSCOPE_CACHE"),
            }
        )

        python_cmd = resolve_python_cmd()

        self.process = await asyncio.create_subprocess_exec(
            python_cmd,
            str(worker_path),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        self.stdout_task = asyncio.create_task(self._consume_output())
        asyncio.create_task(self._consume_stderr())

    async def _consume_output(self):
        assert self.process and self.process.stdout
        async for line in self.process.stdout:
            line = line.decode("utf-8", errors="ignore").strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                # Not a JSON line, skip
                continue

            if payload.get("status") == "ready":
                self.ready_event.set()
                continue

            request_id = payload.get("request_id")
            session_id = payload.get("session_id")

            # Resolve pending HTTP requests
            if request_id and request_id in self.pending_requests:
                fut = self.pending_requests.pop(request_id)
                if not fut.done():
                    fut.set_result(payload)

            # Fan-out to websocket clients
            if session_id and session_id in self.ws_clients:
                ws = self.ws_clients[session_id]
                try:
                    await ws.send_json(payload)
                except RuntimeError:
                    # websocket already closed
                    pass

    async def _consume_stderr(self):
        if not self.process or not self.process.stderr:
            return
        async for line in self.process.stderr:
            sys.stderr.write(line.decode("utf-8", errors="ignore"))
            sys.stderr.flush()

    async def ensure_ready(self):
        await self.start()
        try:
            await asyncio.wait_for(self.ready_event.wait(), timeout=300)  # allow slower first-time downloads
        except asyncio.TimeoutError as exc:
            raise RuntimeError("ASR worker did not become ready in time") from exc

    async def stop(self):
        if self.process:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), timeout=10)
            except asyncio.TimeoutError:
                self.process.kill()
        if self.stdout_task:
            self.stdout_task.cancel()
        self.process = None
        self.stdout_task = None
        self.ready_event.clear()

    async def send(self, payload: dict):
        if not self.process or not self.process.stdin:
            raise RuntimeError("Worker process is not running")
        data = json.dumps(payload, ensure_ascii=False) + "\n"
        self.process.stdin.write(data.encode("utf-8"))
        await self.process.stdin.drain()

    async def force_commit(self, session_id: str):
        await self.send({"type": "force_commit", "session_id": session_id})

    async def reset_session(self, session_id: str):
        await self.send({"type": "reset_session", "session_id": session_id})

    def bind_ws(self, session_id: str, ws: WebSocket):
        self.ws_clients[session_id] = ws

    def unbind_ws(self, session_id: str):
        self.ws_clients.pop(session_id, None)

    async def request_transcribe(self, audio_path: str, timeout: float = 300.0):
        request_id = str(uuid4())
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self.pending_requests[request_id] = fut

        await self.send(
            {
                "type": "batch_file",
                "request_id": request_id,
                "audio_path": audio_path,
            }
        )
        return await asyncio.wait_for(fut, timeout=timeout)


app = FastAPI()
bridge: Optional[WorkerBridge] = None


@app.on_event("startup")
async def startup():
    global bridge
    bridge = WorkerBridge(engine=DEFAULT_ENGINE, model=DEFAULT_MODEL)
    await bridge.ensure_ready()


@app.on_event("shutdown")
async def shutdown():
    if bridge:
        await bridge.stop()


@app.get("/health")
async def health():
    return {"status": "ok", "engine": DEFAULT_ENGINE, "model": DEFAULT_MODEL}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if not bridge:
        raise HTTPException(status_code=500, detail="ASR bridge not initialized")

    suffix = Path(file.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await bridge.request_transcribe(tmp_path)
        return JSONResponse(result)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


@app.websocket("/ws/transcribe")
async def ws_transcribe(websocket: WebSocket, session_id: str):
    if not bridge:
        await websocket.close(code=1011)
        return

    await bridge.ensure_ready()
    await websocket.accept()
    bridge.bind_ws(session_id, websocket)

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if message.get("bytes") is not None:
                audio_bytes: bytes = message["bytes"]
                audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
                await bridge.send(
                    {
                        "type": "streaming_chunk",
                        "session_id": session_id,
                        "audio_data": audio_b64,
                        "timestamp": int(time.time() * 1000),
                        "is_final": False,
                    }
                )
            elif message.get("text"):
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = payload.get("type")
                if msg_type == "force_commit":
                    await bridge.force_commit(session_id)
                elif msg_type == "reset_session":
                    await bridge.reset_session(session_id)
    except WebSocketDisconnect:
        pass
    finally:
        bridge.unbind_ws(session_id)
        try:
            await bridge.reset_session(session_id)
        except Exception:
            pass
        await websocket.close()


def main():
    host = os.environ.get("ASR_HOST", "127.0.0.1")
    port = int(os.environ.get("ASR_PORT", "0") or 0)
    if port == 0:
        # pick random free port if not set
        import socket

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((host, 0))
            port = s.getsockname()[1]

    print(f"[ASR API] Starting FastAPI server on {host}:{port} (engine={DEFAULT_ENGINE}, model={DEFAULT_MODEL})")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()

