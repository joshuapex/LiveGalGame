import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import { setTimeout as delay } from 'node:timers/promises';
import * as logger from '../utils/logger.js';

const PCM_SAMPLE_RATE = 16000;

function float32ToInt16Buffer(floatArray) {
  const int16Array = new Int16Array(floatArray.length);
  for (let i = 0; i < floatArray.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, floatArray[i]));
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return Buffer.from(int16Array.buffer);
}

class LocalWhisperService {
  constructor() {
    this.modelName = 'medium';
    this.pythonPath = this.detectPythonPath();
    this.workerProcess = null;
    this.isInitialized = false;
    this.onSentenceComplete = null;
    this.onPartialResult = null;
    this.onServerCrash = null;
    this.retainAudioFiles = false;
    this.silenceTimer = null;

    this.tempDir = path.join(app.getPath('temp'), 'asr');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    this.workerScriptPath = path.join(__dirname, 'asr_worker.py');

    logger.log(`[LocalWhisper] Python path: ${this.pythonPath}`);
    logger.log(`[LocalWhisper] Worker script: ${this.workerScriptPath}`);
  }

  setServerCrashCallback(callback) {
    this.onServerCrash = callback;
  }

  detectPythonPath() {
    const envPython = process.env.ASR_PYTHON_PATH;
    if (envPython && fs.existsSync(envPython)) {
      return envPython;
    }
    const projectRoot = path.resolve(app.getAppPath(), app.isPackaged ? '../..' : '.');
    const venvPython = path.join(projectRoot, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPython)) {
      return venvPython;
    }
    // Windows 下可能是 python.exe
    if (process.platform === 'win32') {
      const venvPythonWin = path.join(projectRoot, '.venv', 'Scripts', 'python.exe');
      if (fs.existsSync(venvPythonWin)) {
        return venvPythonWin;
      }
    }
    return 'python3';
  }

  async initialize(modelName = 'medium', options = {}) {
    if (this.isInitialized) return true;

    this.modelName = modelName || this.modelName;
    this.retainAudioFiles = options.retainAudioFiles || false;
    this.audioStoragePath = options.audioStoragePath || this.tempDir;

    await this.startWorker();
    this.isInitialized = true;
    logger.log('[LocalWhisper] Service initialized');
    return true;
  }

  async startWorker() {
    if (this.workerProcess) return;

    const args = [this.workerScriptPath];

    // 设置环境变量
    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      ASR_MODEL: this.modelName,
      PYTHONIOENCODING: 'utf-8'
    };

    logger.log(`[LocalWhisper] Spawning worker: ${this.pythonPath} ${args.join(' ')}`);

    this.workerProcess = spawn(this.pythonPath, args, { env });

    // 处理标准输出（来自 worker 的 JSON 消息）
    this.workerProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.handleWorkerMessage(msg);
        } catch (e) {
          // 忽略非 JSON 输出
        }
      }
    });

    // 处理标准错误（日志）
    this.workerProcess.stderr.on('data', (data) => {
      logger.log(`[LocalWhisper][Worker] ${data.toString().trim()}`);
    });

    this.workerProcess.on('close', (code) => {
      logger.warn(`[LocalWhisper] Worker exited with code ${code}`);
      this.workerProcess = null;
      this.isInitialized = false;
      if (this.onServerCrash) {
        this.onServerCrash(code);
      }
    });

    // 等待 Worker 就绪
    // 这里简单等待一下，实际可以用 Promise 等待 "ready" 消息
    // 但为了保持简单，假设启动成功
    await delay(1000);
  }

  handleWorkerMessage(msg) {
    if (msg.type === 'partial') {
      if (this.onPartialResult) {
        this.onPartialResult({
          sessionId: msg.session_id,
          partialText: msg.text,
          fullText: msg.full_text,
          timestamp: msg.timestamp,
          isSpeaking: true
        });
      }
    } else if (msg.type === 'sentence_complete') {
      if (this.onSentenceComplete) {
        this.onSentenceComplete({
          sessionId: msg.session_id,
          text: msg.text,
          timestamp: msg.timestamp,
          trigger: msg.trigger || 'worker',
          audioDuration: msg.audio_duration,
          language: msg.language
        });
      }
    } else if (msg.status === 'ready') {
      logger.log('[LocalWhisper] Worker is ready');
    } else if (msg.error) {
      logger.error(`[LocalWhisper] Worker error: ${msg.error}`);
    }
  }

  async addAudioChunk(audioData, timestamp, sourceId = 'default') {
    if (!this.workerProcess) return;

    if (!audioData || audioData.length === 0) return;

    // 【优化】提高静音检测阈值，减少误触发
    // 简单的静音检测（虽然 worker 也有 VAD）
    if (this.detectSilence(audioData)) {
      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          this.forceCommitSentence(sourceId);
          this.silenceTimer = null;
        }, 1500); // 【优化】从700ms提高到1500ms，减少句子截断
      }
      return;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    const buffer = float32ToInt16Buffer(audioData);
    const base64Audio = buffer.toString('base64');

    const msg = {
      type: 'streaming_chunk',
      session_id: sourceId,
      audio_data: base64Audio,
      timestamp: timestamp
    };

    this.sendToWorker(msg);
  }

  sendToWorker(msg) {
    if (this.workerProcess && this.workerProcess.stdin.writable) {
      this.workerProcess.stdin.write(JSON.stringify(msg) + '\n');
    }
  }

  detectSilence(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i += 1) {
      sum += Math.abs(audioData[i]);
    }
    const average = sum / audioData.length;
    // 【优化】提高阈值，减少误判
    return average < 0.003;
  }

  async forceCommitSentence(sourceId = 'default') {
    this.sendToWorker({
      type: 'force_commit',
      session_id: sourceId
    });
  }

  async commitSentence() {
    return null;
  }

  setSentenceCompleteCallback(callback) {
    this.onSentenceComplete = callback;
  }

  setPartialResultCallback(callback) {
    this.onPartialResult = callback;
  }

  async stop() {
    if (this.workerProcess) {
      this.workerProcess.kill();
      this.workerProcess = null;
    }
    this.isInitialized = false;
  }

  async destroy() {
    await this.stop();
  }

  async saveAudioFile(audioData, recordId, conversationId, sourceId) {
    // ... 复用 ASRService 的逻辑，或者简单实现 ...
    if (!this.retainAudioFiles) return null;

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
    // Copied from ASRService
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

  clearContext(sourceId) {
    this.sendToWorker({
      type: 'reset_session',
      session_id: sourceId
    });
  }
}

export default LocalWhisperService;

