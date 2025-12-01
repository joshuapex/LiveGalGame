import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';
import { spawn } from 'child_process';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { app } from 'electron';
import killPort from 'kill-port';
import * as logger from '../utils/logger.js';
import { getAsrModelPreset } from '../shared/asr-models.js';

const DEFAULT_WLK_HOST = '127.0.0.1';
const DEFAULT_WLK_PORT = Number(process.env.WHISPERLIVEKIT_PORT || 18765);
const PCM_SAMPLE_RATE = 16000;
const MAX_LINE_HISTORY = 200;
const DEFAULT_SILENCE_THRESHOLD_SECONDS = Number(process.env.WHISPERLIVEKIT_SILENCE_THRESHOLD || 0.6);
const DEFAULT_MAX_SENTENCE_CHARS = Number(process.env.WHISPERLIVEKIT_MAX_SENTENCE_CHARS || 50);

function getAppModelCacheDir() {
  try {
    return path.join(app.getPath('userData'), 'hf-home', 'hub');
  } catch {
    return null;
  }
}

function getModelCacheCandidates() {
  const homeDir = os.homedir();
  const appCacheDir = getAppModelCacheDir();
  const candidates = [
    process.env.ASR_CACHE_DIR,
    process.env.HF_HOME ? path.join(process.env.HF_HOME, 'hub') : null,
    appCacheDir,
    homeDir ? path.join(homeDir, '.cache', 'huggingface', 'hub') : null,
    homeDir ? path.join(homeDir, '.cache', 'modelscope', 'hub') : null,
  ];
  return [...new Set(candidates.filter(Boolean))];
}

function ensureDirectoryExists(dir) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore failures
  }
}

// 句子级标点和启发式配置（主要面向中文）
const SENTENCE_END_PUNCTUATION = new Set('。！？!?；;');
const CLAUSE_PUNCTUATION = new Set('，,、：:');
const QUESTION_SUFFIXES = new Set(['吗', '么', '呢', '?', '？']);
const EXCLAMATION_SUFFIXES = new Set(['啊', '呀', '！', '!']);

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

/**
 * 文本分句器（仅在 WhisperLiveKit 流水线中使用）
 *
 * - 在客户端维护一个原始文本缓冲区（rawBuffer），按时间间隔和长度做启发式断句
 * - 只依赖后端给出的 text/start/end，不修改 ASR 服务器行为
 * - 返回值中同时包含：
 *   - text: 用于 UI 展示的带标点句子
 *   - rawLength: 该句在原始缓冲区中消耗的字符数（不包含我们补的标点）
 */
class TextSegmenter {
  constructor(config = {}) {
    this.rawBuffer = '';
    this.lastEndSeconds = 0;
    this.config = {
      silenceThresholdSec: config.silenceThresholdSec ?? DEFAULT_SILENCE_THRESHOLD_SECONDS,
      maxSentenceChars: config.maxSentenceChars ?? DEFAULT_MAX_SENTENCE_CHARS,
    };
  }

  /**
   * 处理一条 WhisperLiveKit 的 line
   * @param {{ start: string, end: string, text: string }} line
   * @returns {{ text: string, rawLength: number }[]} 确认的句子列表
   */
  processLine(line) {
    const sentences = [];
    const rawText = (line.text || '');
    if (!rawText.trim()) {
      this.lastEndSeconds = parseClockToSeconds(line.end);
      return sentences;
    }

    const startSeconds = parseClockToSeconds(line.start);
    const endSeconds = parseClockToSeconds(line.end);

    // 1. 基于时间间隔的断句：如果当前片段和上一个片段之间静音较长，则认为上一句已经结束
    if (this.rawBuffer) {
      const gap = startSeconds - this.lastEndSeconds;
      if (gap > this.config.silenceThresholdSec) {
        const flushed = this.flushInternal();
        if (flushed) {
          sentences.push(flushed);
        }
      }
    }

    // 2. 追加当前文本到原始缓冲区
    this.rawBuffer += rawText;
    this.lastEndSeconds = endSeconds;

    // 3. 基于长度/标点的兜底切分，避免一句话过长
    this.drainByLengthAndPunctuation(sentences);

    return sentences;
  }

  /**
   * 根据当前 rawBuffer 的长度和内部标点，尝试切出完整句子
   * @param {Array} outSentences
   */
  drainByLengthAndPunctuation(outSentences) {
    const { maxSentenceChars } = this.config;
    // 循环处理，直到缓冲区长度在安全范围内
    // 或者再也找不到合理的切分点
    // 注意：这里完全基于原始文本，不依赖我们补的标点
    while (this.rawBuffer && this.rawBuffer.length >= maxSentenceChars) {
      const boundaryIndex = this.findLastBoundaryIndex(this.rawBuffer, maxSentenceChars);
      if (boundaryIndex === -1) {
        // 找不到合适的边界，只能整体作为一句
        const flushed = this.flushInternal();
        if (flushed) {
          outSentences.push(flushed);
        }
        break;
      }

      const rawSentence = this.rawBuffer.slice(0, boundaryIndex + 1);
      this.rawBuffer = this.rawBuffer.slice(boundaryIndex + 1);

      const finalized = this.finalizeRawSentence(rawSentence);
      if (finalized) {
        outSentences.push(finalized);
      }
    }
  }

  /**
   * 在给定窗口内，从后往前寻找最近的断句边界（句末标点优先，其次逗号等）
   * @param {string} text
   * @param {number} window
   * @returns {number} 边界下标，找不到则返回 -1
   */
  findLastBoundaryIndex(text, window) {
    const searchEnd = Math.min(text.length, window);
    for (let i = searchEnd - 1; i >= 0; i -= 1) {
      const ch = text[i];
      if (SENTENCE_END_PUNCTUATION.has(ch) || CLAUSE_PUNCTUATION.has(ch)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 将原始句子转换为最终展示文本，并返回其原始长度
   * @param {string} rawSentence
   * @returns {{ text: string, rawLength: number } | null}
   */
  finalizeRawSentence(rawSentence) {
    if (!rawSentence) return null;
    const raw = rawSentence;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const textWithPunctuation = this.applyPunctuation(trimmed);
    return {
      text: textWithPunctuation,
      rawLength: raw.length,
    };
  }

  /**
   * 内部 flush，不重置时间，只消费 rawBuffer
   * @returns {{ text: string, rawLength: number } | null}
   */
  flushInternal() {
    if (!this.rawBuffer) return null;
    const rawSentence = this.rawBuffer;
    this.rawBuffer = '';
    return this.finalizeRawSentence(rawSentence);
  }

  /**
   * 对句子末尾补充合理的标点（仅在没有终止符时才补）
   * @param {string} text
   * @returns {string}
   */
  applyPunctuation(text) {
    if (!text) return text;
    const lastChar = text[text.length - 1];
    if (SENTENCE_END_PUNCTUATION.has(lastChar)) {
      return text;
    }

    // 根据句末语气词猜测问号/感叹号
    if (QUESTION_SUFFIXES.has(lastChar)) {
      return `${text}？`;
    }
    if (EXCLAMATION_SUFFIXES.has(lastChar)) {
      return `${text}！`;
    }

    // 如果以逗号、顿号等结束，将其升级为句号
    if (CLAUSE_PUNCTUATION.has(lastChar)) {
      return `${text.slice(0, -1)}。`;
    }

    return `${text}。`;
  }

  /**
   * 显式 flush：通常在会话结束或服务器 ready_to_stop 时调用
   * @returns {{ text: string, rawLength: number }[]} 剩余句子（最多一条）
   */
  flush() {
    const result = this.flushInternal();
    if (!result) return [];
    return [result];
  }

  reset() {
    this.rawBuffer = '';
    this.lastEndSeconds = 0;
  }
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
    this.segmenter = new TextSegmenter();
    this.pendingBuffers = [];
    this.sentLineIds = new Set();
    this.lineOrder = [];
    this.lastPartialText = '';
    // 记录已经"确认"的原始字符数，用于与 buffer_transcription 对齐
    this.rawCommittedChars = 0;
    // 【修复累积问题】追踪每个 line.start 对应的已处理文本长度
    // 用于检测是否是同一个 line 的更新（累积结果）
    this.processedLineStarts = new Map(); // start -> { endTime, textLength }
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

    if (payload.type === 'config') {
      return;
    }

    // 会话结束信号：flush 剩余缓冲区
    if (payload.type === 'ready_to_stop') {
      const flushedSentences = this.segmenter.flush();
      const timestamp = Date.now();
      flushedSentences.forEach((sentence, index) => {
        if (!sentence || !sentence.text) return;
        this.rawCommittedChars += sentence.rawLength || 0;
        if (this.onSentence) {
          this.onSentence({
            sessionId: this.sourceId,
            text: sentence.text,
            timestamp,
            trigger: 'whisperlivekit',
            audioDuration: null,
            language: payload.detected_language || null,
            // 最后一条 flush 的句子标记为段落结束，触发斩断
            isSegmentEnd: index === flushedSentences.length - 1,
          });
        }
      });
      // 即使没有 flush 出句子，也要通知斩断（会话结束）
      if (flushedSentences.length === 0 && this.onSentence) {
        this.onSentence({
          sessionId: this.sourceId,
          text: null,
          timestamp,
          trigger: 'ready_to_stop',
          isSegmentEnd: true,
        });
      }
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

        const startSeconds = parseClockToSeconds(line.start);
        const endSeconds = parseClockToSeconds(line.end);
        const duration = Math.max(0, endSeconds - startSeconds);

        // 【修复累积问题】检测是否是同一个 line 的更新
        // WhisperLiveKit 发送的是累积结果，同一个 start 的 line 会不断更新
        const processedInfo = this.processedLineStarts.get(line.start);
        if (processedInfo) {
          // 如果已经处理过这个 start，检查文本是否有新增
          const prevTextLength = processedInfo.textLength;
          if (text.length <= prevTextLength) {
            // 文本没有新增，跳过（可能是重复或回退）
            return;
          }
          // 文本有新增，只处理增量部分
          const incrementalText = text.slice(prevTextLength);
          if (!incrementalText.trim()) {
            return;
          }
          // 更新记录
          this.processedLineStarts.set(line.start, {
            endTime: endSeconds,
            textLength: text.length,
          });
          // 创建增量 line 对象
          const incrementalLine = {
            start: line.start,
            end: line.end,
            text: incrementalText,
            detected_language: line.detected_language,
          };
          // 处理增量
          const sentences = this.segmenter.processLine(incrementalLine);
          sentences.forEach((sentence, index) => {
            if (!sentence || !sentence.text) return;
            this.rawCommittedChars += sentence.rawLength || 0;
            if (this.onSentence) {
              const isSegmentEnd = index < sentences.length - 1;
              this.onSentence({
                sessionId: this.sourceId,
                text: sentence.text,
                timestamp,
                trigger: 'whisperlivekit',
                audioDuration: duration,
                language: line.detected_language || null,
                isSegmentEnd,
              });
            }
          });
          return;
        }

        // 新的 start，正常处理
        this.processedLineStarts.set(line.start, {
          endTime: endSeconds,
          textLength: text.length,
        });

        // 清理过期的 start 记录（保留最近的）
        if (this.processedLineStarts.size > MAX_LINE_HISTORY) {
          const oldestStart = this.processedLineStarts.keys().next().value;
          this.processedLineStarts.delete(oldestStart);
        }

        // 旧的 lineId 去重逻辑仍然保留，作为额外的安全网
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

        // 将行文本送入分句器，按句子粒度输出
        const sentences = this.segmenter.processLine(line);
        sentences.forEach((sentence, index) => {
          if (!sentence || !sentence.text) return;
          // 记录在原始文本中已经"确认"的字符数，用于后续 partial 去重
          this.rawCommittedChars += sentence.rawLength || 0;
          if (this.onSentence) {
            // 如果分句器输出了多个句子，前面的句子标记为段落结束（基于静音间隔的断句）
            // 只有最后一个句子继续保持"进行中"状态
            const isSegmentEnd = index < sentences.length - 1;
            this.onSentence({
              sessionId: this.sourceId,
              text: sentence.text,
              timestamp,
              trigger: 'whisperlivekit',
              audioDuration: duration,
              language: line.detected_language || null,
              isSegmentEnd,
            });
          }
        });
      });
    }

    // 处理流式 partial，减去已经确认的原始文本部分
    const fullRaw = payload.buffer_transcription || '';
    if (typeof fullRaw === 'string' && fullRaw.length > 0) {
      let rawPartial = fullRaw;
      if (this.rawCommittedChars > 0 && fullRaw.length > this.rawCommittedChars) {
        rawPartial = fullRaw.slice(this.rawCommittedChars);
      } else if (this.rawCommittedChars >= fullRaw.length) {
        rawPartial = '';
      }

      const partialText = rawPartial.trim();
      if (partialText && partialText !== this.lastPartialText) {
        this.lastPartialText = partialText;
        if (this.onPartial) {
          this.onPartial({
            sessionId: this.sourceId,
            partialText,
            fullText: fullRaw,
            timestamp,
            isSpeaking: true,
          });
        }
      }
    }
  }

  reset() {
    this.lastPartialText = '';
    this.sentLineIds.clear();
    this.lineOrder = [];
    this.segmenter.reset();
    this.rawCommittedChars = 0;
    // 【修复累积问题】清理 line start 追踪
    this.processedLineStarts.clear();
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
    this.onServerCrash = null; // 服务器崩溃回调
    this.retainAudioFiles = false;
    this.serverStartRetries = 0;
    this.maxServerRetries = 3;

    this.tempDir = path.join(app.getPath('temp'), 'asr');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    logger.log(`[WhisperLiveKit] Python path detected: ${this.pythonPath}`);
  }

  resolveModelCacheDir(modelName) {
    const candidates = getModelCacheCandidates();
    const preset = getAsrModelPreset(modelName);
    const repoId = preset?.repoId || (typeof modelName === 'string' && modelName.includes('/') ? modelName : null);
    const repoSafe = repoId ? `models--${repoId.replace(/\//g, '--')}` : null;
    const msRepoId = preset?.modelScopeRepoId;

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        if (repoSafe && fs.existsSync(path.join(candidate, repoSafe))) {
          ensureDirectoryExists(candidate);
          return candidate;
        }
        if (msRepoId && fs.existsSync(path.join(candidate, msRepoId))) {
          ensureDirectoryExists(candidate);
          return candidate;
        }
      } catch {
        // 忽略探测过程中出现的问题，继续尝试下一个目录
      }
    }

    const fallback = candidates[0] || getAppModelCacheDir() || path.join(os.homedir(), '.cache', 'huggingface', 'hub');
    ensureDirectoryExists(fallback);
    return fallback;
  }

  /**
   * 设置服务器崩溃回调
   * @param {Function} callback - (exitCode) => void
   */
  setServerCrashCallback(callback) {
    this.onServerCrash = callback;
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

    // 预加载模型（如果失败，服务器启动时会自动下载）
    await this.preloadModel();

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
      await this.runPythonCommand(['-m', 'pip', 'show', 'faster-whisper']);
      this.whisperLiveKitReady = true;
      return;
    } catch {
      logger.log('[WhisperLiveKit] Installing whisperlivekit and faster-whisper via pip...');
    }

    await this.runPythonCommand(['-m', 'pip', 'install', '--upgrade', 'whisperlivekit', 'faster-whisper']);
    this.whisperLiveKitReady = true;
  }

  async preloadModel() {
    try {
      logger.log(`[WhisperLiveKit] Preloading ${this.modelName} model...`);
      // 使用faster-whisper直接加载模型来预热缓存，指定 download_root 确保使用正确的缓存目录
      const modelCacheDir = this.resolveModelCacheDir(this.modelName);

      await this.runPythonCommand([
        '-c',
        `from faster_whisper import WhisperModel; print("Loading ${this.modelName} model from ${modelCacheDir}..."); model = WhisperModel('${this.modelName}', device='cpu', compute_type='int8', download_root='${modelCacheDir}'); print("${this.modelName} model loaded successfully")`
      ]);
      logger.log(`[WhisperLiveKit] ${this.modelName} model preloaded successfully`);
      return true;
    } catch (error) {
      logger.warn(`[WhisperLiveKit] Model preload failed, will download during server start: ${error.message}`);
      return false;
    }
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

    try {
      await killPort(this.serverPort);
      logger.log(`[WhisperLiveKit] Released port ${this.serverPort}`);
    } catch (error) {
      // Ignore errors if port wasn't occupied
      logger.log(`[WhisperLiveKit] Port cleanup info: ${error.message}`);
    }

    // 等待一小段时间确保端口完全释放
    await delay(500);

    const modelCacheDir = this.resolveModelCacheDir(this.modelName);

    const args = [
      '-m',
      'whisperlivekit.basic_server',
      '--model',
      this.modelName,
      '--model_cache_dir',
      modelCacheDir,
      '--language',
      this.language,
      '--host',
      this.serverHost,
      '--port',
      String(this.serverPort),
      '--backend-policy',
      this.backendPolicy,
      '--backend',
      'faster-whisper',
      '--pcm-input',
    ];

    logger.log(`[WhisperLiveKit] Spawning server: ${this.pythonPath} ${args.join(' ')}`);

    // 使用 Promise 来跟踪服务器启动过程中的崩溃
    const serverStartPromise = new Promise((resolve, reject) => {
      this.wlkProcess = spawn(this.pythonPath, args, {
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      });

      let startupComplete = false;

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

        // 如果服务器在启动阶段就崩溃了，reject promise
        if (!startupComplete) {
          reject(new Error(`Server crashed during startup with code ${code}`));
          return;
        }

        // 如果是启动后崩溃，通知上层
        if (this.onServerCrash) {
          this.onServerCrash(code);
        }
      });

      this.wlkProcess.on('error', (error) => {
        logger.error(`[WhisperLiveKit] Server process error:`, error);
        if (!startupComplete) {
          reject(error);
        }
      });

      // 标记启动阶段完成的函数
      this._markStartupComplete = () => {
        startupComplete = true;
        resolve();
      };
    });

    // 并行等待：服务器就绪 或 服务器崩溃
    try {
      await Promise.race([
        this.waitForServerReady().then(() => {
          if (this._markStartupComplete) {
            this._markStartupComplete();
          }
        }),
        serverStartPromise
      ]);
    } catch (error) {
      // 服务器启动失败，尝试重试
      this.serverStartRetries++;
      if (this.serverStartRetries < this.maxServerRetries) {
        logger.warn(`[WhisperLiveKit] Server start failed, retry ${this.serverStartRetries}/${this.maxServerRetries}...`);
        await delay(2000); // 等待2秒后重试
        return this.startWhisperLiveKitServer();
      }
      throw new Error(`Server failed to start after ${this.maxServerRetries} retries: ${error.message}`);
    }

    this.serverStartRetries = 0; // 重置重试计数
  }

  async waitForServerReady(timeoutMs = 60000) { // 增加到60秒，处理模型下载
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

