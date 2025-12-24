#!/usr/bin/env python3
# coding: utf-8
"""
Baidu Cloud ASR Worker - WebSocket Streaming Mode
实现百度实时语音识别，支持“字随声出”流式反馈。
"""

import asyncio
import base64
import json
import os
import platform
import sys
import time
import uuid
import wave
import io
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import requests
import websockets

# ==============================================================================
# IPC 通道重定向
# ==============================================================================
# 保持与 main.py 的 IPC 通信一致
ipc_fd = os.dup(sys.stdout.fileno())
ipc_channel = os.fdopen(ipc_fd, "w", buffering=1, encoding="utf-8")
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
sys.stdout = sys.stderr

def send_ipc_message(data: dict):
    try:
        ipc_channel.write(json.dumps(data, ensure_ascii=False) + "\n")
        ipc_channel.flush()
    except Exception as exc:
        sys.stderr.write(f"[IPC Error] {exc}\n")
        sys.stderr.flush()

# ==============================================================================
# 配置
# ==============================================================================
BAIDU_APP_ID = os.environ.get("BAIDU_APP_ID", "").strip()
BAIDU_API_KEY = os.environ.get("BAIDU_API_KEY", "").strip()
BAIDU_SECRET_KEY = os.environ.get("BAIDU_SECRET_KEY", "").strip()

if not BAIDU_APP_ID or not BAIDU_API_KEY or not BAIDU_SECRET_KEY:
    sys.stderr.write("[Baidu Worker] WARNING: BAIDU_APP_ID, BAIDU_API_KEY or BAIDU_SECRET_KEY not set in environment variables.\n")
    sys.stderr.flush()

BAIDU_WS_URL = "wss://vop.baidu.com/realtime_asr"
SAMPLE_RATE = int(os.environ.get("ASR_SAMPLE_RATE", "16000"))

# 能量检测阈值 (RMS)，用于给 UI 反馈“正在说话”
# 300/32768 约等于 0.009
SPEECH_THRESHOLD = float(os.environ.get("ASR_RMS_THRESHOLD", "0.009"))

def decode_audio_chunk(audio_b64: str) -> np.ndarray:
    audio_bytes = base64.b64decode(audio_b64)
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    return audio_int16.astype(np.float32)

def float_to_int16(audio_f32: np.ndarray) -> bytes:
    if np.max(np.abs(audio_f32)) <= 1.0:
        return (audio_f32 * 32767).astype(np.int16).tobytes()
    return audio_f32.astype(np.int16).tobytes()

class BaiduSession:
    def __init__(self, session_id: str, worker: 'BaiduWorker'):
        self.session_id = session_id
        self.worker = worker
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.audio_queue = asyncio.Queue()
        self.is_running = False
        self.task_send: Optional[asyncio.Task] = None
        self.task_recv: Optional[asyncio.Task] = None
        self.last_final_text = ""
        self.segment_seq = 0

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        token = await self.worker.get_token_async()
        if not token:
            sys.stderr.write(f"[{self.session_id}] Failed to get Baidu token\n")
            self.is_running = False
            return

        try:
            # 强化 1：使用规范的、不带特殊字符的 sn 和 cuid
            sn = str(uuid.uuid4()).replace("-", "")
            cuid = "livegal_desktop_client"
            # 强化 2：在 URL 握手阶段就带上 token (某些百度集群的要求)
            url = f"{BAIDU_WS_URL}?sn={sn}&token={token}"
            
            sys.stderr.write(f"[{self.session_id}] Connecting to Baidu WS (AppID: {BAIDU_APP_ID})...\n")
            self.ws = await websockets.connect(url)
            
            # 1. 发送 START 帧
            start_frame = {
                "type": "START",
                "data": {
                    "appid": int(BAIDU_APP_ID),
                    "appkey": BAIDU_API_KEY,
                    "appname": "livegal",  # 强化 3：加入应用名称，对应控制台，解决 -3004 错误
                    "dev_pid": 1537, # 普通话
                    "cuid": cuid,
                    "format": "pcm",
                    "sample": SAMPLE_RATE,
                    "token": token
                }
            }
            await self.ws.send(json.dumps(start_frame))
            
            self.task_send = asyncio.create_task(self._send_loop())
            self.task_recv = asyncio.create_task(self._recv_loop())
            sys.stderr.write(f"[{self.session_id}] Baidu WS Connected & Started\n")
        except Exception as e:
            sys.stderr.write(f"[{self.session_id}] WS Connection error: {e}\n")
            self.is_running = False

    async def stop(self):
        self.is_running = False
        if self.ws:
            try:
                # 发送 FINISH 帧
                await self.ws.send(json.dumps({"type": "FINISH"}))
                await asyncio.sleep(0.5)
                await self.ws.close()
            except: pass
        if self.task_send: self.task_send.cancel()
        if self.task_recv: self.task_recv.cancel()
        self.ws = None

    async def _send_loop(self):
        try:
            while self.is_running:
                chunk = await self.audio_queue.get()
                if chunk is None: break
                if self.ws:
                    await self.ws.send(chunk)
        except asyncio.CancelledError: pass
        except Exception as e:
            # 这里的 1005 或 1006 错误通常是由于 FINISH 导致的正常关闭
            if "1005" not in str(e) and "1006" not in str(e):
                sys.stderr.write(f"[{self.session_id}] WS Send error: {e}\n")
        finally:
            self.is_running = False

    async def _recv_loop(self):
        try:
            async for message in self.ws:
                resp = json.loads(message)
                err_no = resp.get("err_no", 0)
                if err_no != 0:
                    sys.stderr.write(f"[{self.session_id}] Baidu Error: {resp.get('err_msg')} (code={err_no})\n")
                    continue
                
                msg_type = resp.get("type")
                text = resp.get("result")
                if isinstance(text, list): text = "".join(text)
                
                if not text: continue

                if msg_type == "MID_TEXT":
                    # 流式中间结果
                    send_ipc_message({
                        "session_id": self.session_id,
                        "type": "partial_result",
                        "partialText": text,
                        "timestamp": int(time.time() * 1000),
                        "engine": "baidu"
                    })
                elif msg_type == "FIN_TEXT":
                    # 一句话最终结果
                    self.segment_seq += 1
                    send_ipc_message({
                        "session_id": self.session_id,
                        "type": "sentence_complete",
                        "text": text,
                        "timestamp": int(time.time() * 1000),
                        "status": "success",
                        "engine": "baidu",
                        "is_segment_end": True,  # 百度 FIN_TEXT 代表一句话结束，强制分句
                        "segment_seq": self.segment_seq
                    })
                    self.last_final_text = text
        except asyncio.CancelledError: pass
        except Exception as e:
            if "1005" not in str(e) and "1006" not in str(e):
                sys.stderr.write(f"[{self.session_id}] WS Recv error: {e}\n")
        finally:
            self.is_running = False
            sys.stderr.write(f"[{self.session_id}] Baidu WS Session closed\n")

    def add_audio(self, audio_bytes: bytes):
        if self.is_running:
            self.audio_queue.put_nowait(audio_bytes)

class BaiduWorker:
    def __init__(self):
        self.sessions: Dict[str, BaiduSession] = {}
        self._token = None
        self._token_expires = 0
        self._token_lock = asyncio.Lock()
        
        sys.stderr.write(f"[Baidu Worker] WebSocket Mode Initialized (Lightweight RMS VAD)\n")

    async def get_token_async(self):
        async with self._token_lock:
            if self._token and time.time() < self._token_expires:
                return self._token
            
            url = "https://aip.baidubce.com/oauth/2.0/token"
            params = {
                "grant_type": "client_credentials",
                "client_id": BAIDU_API_KEY,
                "client_secret": BAIDU_SECRET_KEY
            }
            try:
                # 使用 loop.run_in_executor 运行同步请求
                loop = asyncio.get_running_loop()
                resp = await loop.run_in_executor(None, lambda: requests.get(url, params=params, timeout=10))
                data = resp.json()
                if "access_token" in data:
                    self._token = data["access_token"]
                    self._token_expires = time.time() + data.get("expires_in", 2592000) - 3600
                    return self._token
            except Exception as e:
                sys.stderr.write(f"[Baidu Worker] Token error: {e}\n")
            return None

    def _is_speech(self, chunk_f32: np.ndarray) -> bool:
        # 使用简单的 RMS 能量检测
        if chunk_f32.size == 0:
            return False
        rms = float(np.sqrt(np.mean(chunk_f32 ** 2)))
        return rms >= SPEECH_THRESHOLD

    async def handle_streaming_chunk(self, data: dict):
        session_id = data.get("session_id") or "default"
        audio_b64 = data.get("audio_data")
        if not audio_b64: return

        if session_id not in self.sessions:
            self.sessions[session_id] = BaiduSession(session_id, self)
        
        session = self.sessions[session_id]
        if not session.is_running:
            await session.start()
        
        chunk_f32 = decode_audio_chunk(audio_b64)
        has_voice = self._is_speech(chunk_f32)
        
        audio_bytes = float_to_int16(chunk_f32)
        session.add_audio(audio_bytes)
        
        # 通知 UI 说话状态 (is_speaking)
        if has_voice:
            send_ipc_message({
                "session_id": session_id,
                "type": "is_speaking",
                "isSpeaking": True
            })

    async def handle_reset_session(self, data: dict):
        session_id = data.get("session_id")
        if session_id in self.sessions:
            await self.sessions[session_id].stop()
            del self.sessions[session_id]

    async def handle_force_commit(self, data: dict):
        # 对于 WebSocket 模式，force_commit 不应该简单的重启，
        # 因为这会导致正在处理的语音丢失。
        # 我们发送 FINISH 帧让百度完成当前识别即可。
        session_id = data.get("session_id")
        if session_id in self.sessions:
            session = self.sessions[session_id]
            if session.ws and session.is_running:
                try:
                    sys.stderr.write(f"[{session_id}] Force commit: sending FINISH frame\n")
                    await session.ws.send(json.dumps({"type": "FINISH"}))
                    # 百度收到 FINISH 后会返回 FIN_TEXT，recv_loop 会处理存库
                except Exception as e:
                    sys.stderr.write(f"[{session_id}] Force commit error: {e}\n")

async def read_stdin(queue):
    loop = asyncio.get_event_loop()
    while True:
        # sys.stdin.readline 是阻塞的，在执行器中运行以避免卡死主循环
        line = await loop.run_in_executor(None, sys.stdin.readline)
        if not line:
            break
        stripped = line.strip()
        if stripped:
            await queue.put(stripped)

async def main():
    # Windows 下 connect_read_pipe 在 ProactorEventLoop 中不稳定 (WinError 6)
    # 我们改用 SelectorEventLoop 或者直接使用线程读取 stdin
    if platform.system() == "Windows":
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        except:
            pass

    worker = BaiduWorker()
    send_ipc_message({"status": "ready"})
    
    queue = asyncio.Queue()
    asyncio.create_task(read_stdin(queue))
    
    while True:
        line = await queue.get()
        if not line: break
        try:
            data = json.loads(line)
            rtype = data.get("type")
            if rtype == "streaming_chunk":
                await worker.handle_streaming_chunk(data)
            elif rtype == "reset_session":
                await worker.handle_reset_session(data)
            elif rtype == "force_commit":
                await worker.handle_force_commit(data)
        except Exception as e:
            sys.stderr.write(f"[Baidu Worker] Error processing line: {e}\n")

if __name__ == "__main__":
    asyncio.run(main())
