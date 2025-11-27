import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { app } from 'electron';
import * as logger from '../utils/logger.js';

const DEFAULT_WLK_HOST = '127.0.0.1';
const DEFAULT_WLK_PORT = Number(process.env.WHISPERLIVEKIT_PORT || 18765);
const PCM_SAMPLE_RATE = 16000;
const MAX_LINE_HISTORY = 200;

function float32ToInt16Buffer(floatArray) {
  const int16Array = new Int16Array(floatArray.length);
  for (let i = 0; i < floatArray.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, floatArray[i]));
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return Buffer.from(int16Array.buffer);
}

function parseClockToSeconds(clock) {
  if (!clock) return 0;
  const parts = clock.split(':').map((value) => Number(value));
  if (parts.some(Number.isNaN)) {
    return 0;
  }
  return parts.reduce((acc, part) => acc * 60 + part, 0);
}

class WhisperLiveKitSession {
  constructor({
    sourceId,
    wsUrl,
    onSentence,
    onPartial,
  }) {
    this.sourceId = sourceId;
    this.wsUrl = wsUrl;
    this.onSentence = onSentence;
    this.onPartial = onPartial;
    this.ws = null;
    this.isReady = false;
    this.pendingBuffers = [];
    this.sentLineIds = new Set();
    this.lineOrder = [];
    this.lastPartialText = '';
    this.connect();
  }

  setSentenceCallback(callback) {
    this.onSentence = callback;
  }

  setPartialCallback(callback) {
    this.onPartial = callback;
  }

  connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = 'arraybuffer';

    this.ws.on('open', () => {
      logger.log(`[WhisperLiveKit][${this.sourceId}] WebSocket connected`);
      this.isReady = true;
      this.flushPendingBuffers();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', () => {
      logger.log(`[WhisperLiveKit][${this.sourceId}] WebSocket closed`);
      this.isReady = false;
    });

    this.ws.on('error', (error) => {
      logger.error(`[WhisperLiveKit][${this.sourceId}] WebSocket error:`, error);
    });
  }

  flushPendingBuffers() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    while (this.pendingBuffers.length > 0) {
      const buffer = this.pendingBuffers.shift();
      this.ws.send(buffer);
    }
  }

  sendAudio(buffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingBuffers.push(buffer);
      return;
    }
    this.ws.send(buffer);
  }

  handleMessage(data) {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch (error) {
      logger.warn('[WhisperLiveKit] Failed to parse message:', error);
      return;
    }

    if (!payload) {
      return;
    }

    if (payload.type === 'config' || payload.type === 'ready_to_stop') {
      return;
    }

    if (payload.error) {
      logger.warn(`[WhisperLiveKit][${this.sourceId}] Error from backend: ${payload.error}`);
      return;
    }

    const timestamp = Date.now();

    if (Array.isArray(payload.lines)) {
      payload.lines.forEach((line) => {
        const text = (line.text || '').trim();
        if (!text) {
          return;
        }
        const lineId = `${line.start}-${line.end}-${text}`;
        if (this.sentLineIds.has(lineId)) {
          return;
        }
        this.sentLineIds.add(lineId);
        this.lineOrder.push(lineId);
        if (this.lineOrder.length > MAX_LINE_HISTORY) {
          const oldest = this.lineOrder.shift();
          this.sentLineIds.delete(oldest);
        }

        const startSeconds = parseClockToSeconds(line.start);
        const endSeconds = parseClockToSeconds(line.end);
        const duration = Math.max(0, endSeconds - startSeconds);

        if (this.onSentence) {
          this.onSentence({
            sessionId: this.sourceId,
            text,
            timestamp,
            trigger: 'whisperlivekit',
            audioDuration: duration,
            language: line.detected_language || null,
          });
        }
      });
    }

    const partialText = (payload.buffer_transcription || '').trim();
    if (partialText && partialText !== this.lastPartialText) {
      this.lastPartialText = partialText;
      if (this.onPartial) {
        this.onPartial({
          sessionId: this.sourceId,
          partialText,
          fullText: partialText,
          timestamp,
          isSpeaking: true,
        });
      }
    }
  }

  reset() {
    this.lastPartialText = '';
    this.sentLineIds.clear();
    this.lineOrder = [];
  }

  close() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }
    this.pendingBuffers = [];
  }
}

class ASRService {
  constructor() {
    this.modelName = 'medium';
    this.language = 'zh';
    this.backendPolicy = 'simulstreaming';
    this.serverHost = DEFAULT_WLK_HOST;
    this.serverPort = DEFAULT_WLK_PORT;
    this.pythonPath = this.detectPythonPath();
    this.wlkProcess = null;
    this.isInitialized = false;
    this.whisperLiveKitReady = false;
    this.sessions = new Map();
    this.onSentenceComplete = null;
    this.onPartialResult = null;
    this.retainAudioFiles = false;

    this.tempDir = path.join(app.getPath('temp'), 'asr');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    logger.log(`[WhisperLiveKit] Python path detected: ${this.pythonPath}`);
  }

  detectPythonPath() {
    const envPython = process.env.ASR_PYTHON_PATH;
    if (envPython && fs.existsSync(envPython)) {
      logger.log('[WhisperLiveKit] Using ASR_PYTHON_PATH');
      return envPython;
    }

    const projectRoot = path.resolve(app.getAppPath(), app.isPackaged ? '../..' : '.');
    const venvPython = path.join(projectRoot, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPython)) {
      logger.log('[WhisperLiveKit] Using virtualenv python');
      return venvPython;
    }

    return 'python3';
  }

  async initialize(modelName = 'medium', options = {}) {
    if (this.isInitialized) {
      return true;
    }

    this.modelName = modelName || this.modelName;
    this.retainAudioFiles = options.retainAudioFiles || false;
    this.audioStoragePath = options.audioStoragePath || this.tempDir;

    await this.ensureWhisperLiveKitInstalled();
    await this.startWhisperLiveKitServer();

    this.isInitialized = true;
    logger.log('[WhisperLiveKit] Service initialized');
    return true;
  }

  async ensureWhisperLiveKitInstalled() {
    if (this.whisperLiveKitReady) {
      return;
    }

    try {
      await this.runPythonCommand(['-m', 'pip', 'show', 'whisperlivekit']);
      this.whisperLiveKitReady = true;
      return;
    } catch {
      logger.log('[WhisperLiveKit] Installing whisperlivekit via pip...');
    }

    await this.runPythonCommand(['-m', 'pip', 'install', '--upgrade', 'whisperlivekit']);
    this.whisperLiveKitReady = true;
  }

  runPythonCommand(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, args, {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      });

      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        reject(error);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(stderr || `Python command failed with exit code ${code}`));
        }
      });
    });
  }

  async startWhisperLiveKitServer() {
    if (this.wlkProcess) {
      return;
    }

    const args = [
      '-m',
      'whisperlivekit.basic_server',
      '--model',
      this.modelName,
      '--language',
      this.language,
      '--host',
      this.serverHost,
      '--port',
      String(this.serverPort),
      '--backend-policy',
      this.backendPolicy,
      '--pcm-input',
    ];

    logger.log(`[WhisperLiveKit] Spawning server: ${this.pythonPath} ${args.join(' ')}`);

    this.wlkProcess = spawn(this.pythonPath, args, {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    this.wlkProcess.stdout.on('data', (data) => {
      logger.log(`[WhisperLiveKit][stdout] ${data.toString().trim()}`);
    });

    this.wlkProcess.stderr.on('data', (data) => {
      logger.log(`[WhisperLiveKit][stderr] ${data.toString().trim()}`);
    });

    this.wlkProcess.on('close', (code) => {
      logger.warn(`[WhisperLiveKit] Server exited with code ${code}`);
      this.wlkProcess = null;
      this.isInitialized = false;
    });

    await this.waitForServerReady();
  }

  async waitForServerReady(timeoutMs = 20000) {
    const start = Date.now();

    const tryRequest = () => new Promise((resolve, reject) => {
      const req = http.get({
        hostname: this.serverHost,
        port: this.serverPort,
        path: '/',
        timeout: 2000,
      }, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });
    });

    while (Date.now() - start < timeoutMs) {
      try {
        await tryRequest();
        logger.log('[WhisperLiveKit] Server is ready');
        return;
      } catch {
        await delay(500);
      }
    }

    throw new Error('WhisperLiveKit server failed to start within timeout');
  }

  createSession(sourceId) {
    const wsUrl = `ws://${this.serverHost}:${this.serverPort}/asr`;
    const session = new WhisperLiveKitSession({
      sourceId,
      wsUrl,
      onSentence: (result) => {
        if (this.onSentenceComplete) {
          this.onSentenceComplete(result);
        }
      },
      onPartial: (result) => {
        if (this.onPartialResult) {
          this.onPartialResult(result);
        }
      },
    });
    this.sessions.set(sourceId, session);
    return session;
  }

  getSession(sourceId) {
    if (this.sessions.has(sourceId)) {
      return this.sessions.get(sourceId);
    }
    return this.createSession(sourceId);
  }

  detectSilence(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i += 1) {
      sum += Math.abs(audioData[i]);
    }
    const average = sum / audioData.length;
    return average < 0.0015;
  }

  async addAudioChunk(audioData, timestamp, sourceId = 'default') {
    if (!this.isInitialized) {
      throw new Error('WhisperLiveKit service not initialized');
    }

    if (!audioData || audioData.length === 0) {
      return null;
    }

    if (this.detectSilence(audioData)) {
      return null;
    }

    const session = this.getSession(sourceId);
    const buffer = float32ToInt16Buffer(audioData);
    session.sendAudio(buffer);

    // 识别结果通过回调异步返回
    return null;
  }

  async sendResetCommand(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.reset();
    }
  }

  async forceCommitSentence() {
    // WhisperLiveKit 内部已经处理分句，额外的强制提交不需要
    return false;
  }

  async commitSentence() {
    // WhisperLiveKit 没有单独的提交接口，返回 null 以保持兼容
    return null;
  }

  setSentenceCompleteCallback(callback) {
    this.onSentenceComplete = callback;
    this.sessions.forEach((session) => session.setSentenceCallback(callback));
  }

  setPartialResultCallback(callback) {
    this.onPartialResult = callback;
    this.sessions.forEach((session) => session.setPartialCallback(callback));
  }

  async stop() {
    this.sessions.forEach((session) => session.close());
    this.sessions.clear();
  }

  async destroy() {
    await this.stop();
    if (this.wlkProcess) {
      this.wlkProcess.kill();
      this.wlkProcess = null;
    }
    this.isInitialized = false;
  }

  async saveAudioFile(audioData, recordId, conversationId, sourceId) {
    if (!this.retainAudioFiles) {
      return null;
    }

    const filename = `${recordId}_${sourceId}.wav`;
    const conversationDir = path.join(this.audioStoragePath, conversationId);
    if (!fs.existsSync(conversationDir)) {
      fs.mkdirSync(conversationDir, { recursive: true });
    }

    const filepath = path.join(conversationDir, filename);
    const float32Array = audioData instanceof Float32Array ? audioData : new Float32Array(audioData);
    const wavBuffer = this.createWavBuffer(float32Array);
    fs.writeFileSync(filepath, wavBuffer);
    return filepath;
  }

  createWavBuffer(audioData) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = audioData.length * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataLength);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(PCM_SAMPLE_RATE, 24);
    buffer.writeUInt32LE(PCM_SAMPLE_RATE * blockAlign, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);

    for (let i = 0; i < audioData.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      buffer.writeInt16LE(int16, 44 + i * 2);
    }

    return buffer;
  }

  clearContext() {
    // WhisperLiveKit 自带上下文管理，不需要额外处理
  }
}

export default ASRService;

