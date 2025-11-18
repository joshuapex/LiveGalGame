import { pipeline, env } from '@xenova/transformers';
import pkg from '@ricky0123/vad-web';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as logger from '../utils/logger.js';

const { loadVAD } = pkg;

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置 transformers.js 环境变量
// 优先使用本地 models 目录（构建时包含的模型）
// 如果不存在，回退到应用数据目录的缓存
const localModelsDir = path.join(__dirname, '../../models');
const cacheDir = fs.existsSync(localModelsDir)
  ? localModelsDir
  : path.join(__dirname, '../../.transformers-cache');

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

env.cacheDir = cacheDir;

// 配置远程 URL（如果需要使用镜像站，可以修改这里）
// 注意：transformers.js 会自动检查缓存目录，如果模型文件存在就直接使用，不需要网络请求
env.remoteURL = 'https://huggingface.co';
env.remotePathTemplate = '{model_id}/resolve/main/{path}';

// 记录使用的缓存目录
if (cacheDir === localModelsDir) {
  logger.log(`Using local models directory: ${localModelsDir}`);
  logger.log('Models will be loaded from local directory (included in release)');
} else {
  logger.log(`Using cache directory: ${cacheDir}`);
  logger.log('Models will be downloaded from Hugging Face if not cached');
}

// 注意：undici 的默认超时是 10 秒
// 如果需要更长的超时时间，可以通过环境变量 NODE_OPTIONS 设置
// 或者在系统层面配置代理/网络设置

/**
 * Whisper 语音识别服务
 * 支持实时流式识别、分句处理和音频文件保存
 */
class WhisperService {
  constructor() {
    this.model = null;
    this.vad = null;
    this.isInitialized = false;

    // 音频缓冲区（环形缓冲区，30秒）
    this.audioBuffer = [];
    this.bufferSizeLimit = 30 * 16000; // 30秒 * 采样率
    this.bufferStartTime = 0;

    // VAD 检测结果
    this.vadResults = [];
    this.lastSpeechEndTime = 0;

    // 音频保存配置
    this.retainAudioFiles = false;
    this.audioStoragePath = null;

    // 当前正在识别的句子
    this.currentSentence = {
      startTime: 0,
      audioData: [],
      text: '',
      isRecognizing: false
    };

    logger.log('WhisperService created');
  }

  /**
   * 初始化模型（带重试机制）
   * @param {string} modelName - 模型名称（whisper-tiny/whisper-base/whisper-small）
   * @param {Object} options - 配置选项
   */
  async initialize(modelName = 'whisper-base', options = {}) {
    try {
      logger.log(`Initializing Whisper model: ${modelName}`);

      // 检查模型是否在本地缓存中存在
      const modelId = `Xenova/${modelName}`;
      const isLocalModel = cacheDir === localModelsDir;

      if (isLocalModel) {
        logger.log(`Using local models directory: ${localModelsDir}`);
        logger.log(`Model ID: ${modelId}`);
      } else {
        logger.log(`Using cache directory: ${cacheDir}`);
        logger.log(`Model ID: ${modelId}`);
        logger.log('Will download from Hugging Face if not cached');
      }

      this.model = await pipeline('automatic-speech-recognition', modelId, {
        // transformers.js 会自动管理缓存：
        // 1. 先检查缓存目录是否有模型
        // 2. 如果缓存中没有，从网络下载
        // 3. 下载后保存到缓存目录以供下次使用
      });
      logger.log('Whisper model loaded successfully');

      // 加载 VAD（带重试）
      try {
        this.vad = await loadVAD({
          modelURL: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.16/dist/silero_vad.onnx',
          sampleRate: 16000
        });
        logger.log('VAD model loaded successfully');
      } catch (vadError) {
        logger.warn('Failed to load VAD model, continuing without VAD:', vadError.message);
        // VAD 失败不影响主功能，继续执行
        this.vad = null;
      }

      // 配置音频保存选项
      this.retainAudioFiles = options.retainAudioFiles || false;
      this.audioStoragePath = options.audioStoragePath || null;

      this.isInitialized = true;
      logger.log('WhisperService initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Error initializing WhisperService:`, error);

      const errorMessage = error.message || String(error);
      if (errorMessage.includes('fetch failed') || errorMessage.includes('timeout')) {
        throw new Error(
          `无法连接到 Hugging Face 下载模型（网络错误）。\\n` +
          `解决方案：\\n` +
          `1. 检查网络连接\\n` +
          `2. 运行 'npm run download-models' 预先下载模型\\n` +
          `3. 或使用 whisper.cpp 版本（需要先下载 GGML 模型）\\n` +
          `原始错误: ${errorMessage}`
        );
      }

      throw error;
    }
  }

  /**
   * 音频预处理（采样率转换、格式转换、归一化）
   * @param {Float32Array} audioBuffer - 音频数据
   * @param {number} originalSampleRate - 原始采样率
   * @returns {Float32Array} 处理后的音频数据
   */
  preprocessAudio(audioBuffer, originalSampleRate = 48000) {
    // 如果已经是 16kHz，直接返回
    if (originalSampleRate === 16000) {
      return audioBuffer;
    }

    // 采样率转换（简单线性插值）
    const ratio = 16000 / originalSampleRate;
    const targetLength = Math.floor(audioBuffer.length * ratio);
    const result = new Float32Array(targetLength);

    for (let i = 0; i < targetLength; i++) {
      const sourceIndex = i / ratio;
      const index = Math.floor(sourceIndex);
      const fraction = sourceIndex - index;

      if (index >= audioBuffer.length - 1) {
        result[i] = audioBuffer[audioBuffer.length - 1];
      } else {
        result[i] = audioBuffer[index] * (1 - fraction) + audioBuffer[index + 1] * fraction;
      }
    }

    return result;
  }

  /**
   * 添加音频块到缓冲区（实时调用，每 100ms）
   * @param {Float32Array} audioChunk - 音频数据块
   * @param {number} timestamp - 时间戳（毫秒）
   * @returns {Promise<Object|null>} 如果有完整句子，返回识别结果
   */
  async addAudioChunk(audioChunk, timestamp) {
    try {
      // 预处理音频（转换为 16kHz）
      const processedChunk = this.preprocessAudio(audioChunk);

      // 添加到缓冲区
      this.audioBuffer.push(...processedChunk);

      // 如果缓冲区超过限制，移除旧数据
      if (this.audioBuffer.length > this.bufferSizeLimit) {
        const removeCount = this.audioBuffer.length - this.bufferSizeLimit;
        this.audioBuffer.splice(0, removeCount);
        this.bufferStartTime = timestamp - (this.bufferSizeLimit / 16); // 更新开始时间
      }

      // VAD 检测
      const vadResult = await this.detectVoiceActivity(processedChunk, timestamp);
      this.vadResults.push(vadResult);

      // 清理旧的 VAD 结果（保留最近 10 秒）
      const cutoffTime = timestamp - 10000;
      this.vadResults = this.vadResults.filter(r => r.timestamp > cutoffTime);

      // 检查是否有完整句子
      const sentenceBoundary = this.checkSentenceBoundary(timestamp);

      if (sentenceBoundary.shouldSplit && !this.currentSentence.isRecognizing) {
        // 提取句子音频
        const sentenceAudio = this.extractSentenceAudio(sentenceBoundary);

        // 开始识别
        this.currentSentence.isRecognizing = true;
        const result = await this.transcribeSentence(sentenceAudio, sentenceBoundary);

        // 重置当前句子
        this.currentSentence = {
          startTime: timestamp,
          audioData: [],
          text: '',
          isRecognizing: false
        };

        return result;
      }

      // 累积当前句子音频
      this.currentSentence.audioData.push(...processedChunk);

      return null;
    } catch (error) {
      logger.error('Error processing audio chunk:', error);
      throw error;
    }
  }

  /**
   * VAD 检测（语音活动检测）
   * @param {Float32Array} audioChunk - 音频数据块
   * @param {number} timestamp - 时间戳
   * @returns {Object} VAD 检测结果
   */
  async detectVoiceActivity(audioChunk, timestamp) {
    if (!this.vad) {
      return { isSpeech: true, timestamp };
    }

    try {
      const vadResults = await this.vad.predict(audioChunk);

      // 检查是否有语音
      let isSpeech = false;
      for (const result of vadResults) {
        if (result.isSpeech) {
          isSpeech = true;
          break;
        }
      }

      // 更新最后语音结束时间
      if (isSpeech) {
        this.lastSpeechEndTime = timestamp;
      }

      return { isSpeech, timestamp };
    } catch (error) {
      logger.error('VAD detection error:', error);
      return { isSpeech: true, timestamp }; // 如果 VAD 失败，默认有语音
    }
  }

  /**
   * 检查句子边界（是否应该分句）
   * @param {number} timestamp - 当前时间戳
   * @returns {Object} 分句结果
   */
  checkSentenceBoundary(timestamp) {
    const pauseThreshold = 1000; // 停顿阈值：1 秒
    const maxSentenceLength = 20000; // 最大句子长度：20 秒

    const currentSentenceDuration = timestamp - this.currentSentence.startTime;

    // 1. 检查是否超过最大句子长度
    if (currentSentenceDuration >= maxSentenceLength) {
      return {
        shouldSplit: true,
        startIndex: 0,
        endIndex: this.audioBuffer.length,
        startTime: this.currentSentence.startTime,
        endTime: timestamp
      };
    }

    // 2. 检查停顿时间
    const timeSinceLastSpeech = timestamp - this.lastSpeechEndTime;
    if (timeSinceLastSpeech >= pauseThreshold && currentSentenceDuration > 500) {
      return {
        shouldSplit: true,
        startIndex: 0,
        endIndex: this.audioBuffer.length,
        startTime: this.currentSentence.startTime,
        endTime: timestamp
      };
    }

    return { shouldSplit: false };
  }

  /**
   * 提取句子音频数据
   * @param {Object} boundary - 句子边界信息
   * @returns {Float32Array} 句子音频数据
   */
  extractSentenceAudio(boundary) {
    // 从缓冲区提取音频数据
    const audioData = new Float32Array(this.audioBuffer);

    // 清空已处理的缓冲区数据
    this.audioBuffer = [];

    return audioData;
  }

  /**
   * 识别句子（完整句子）
   * @param {Float32Array} audioData - 句子音频数据
   * @param {Object} boundary - 句子边界信息
   * @returns {Promise<Object>} 识别结果
   */
  async transcribeSentence(audioData, boundary) {
    try {
      logger.log(`Transcribing audio segment: ${audioData.length} samples`);

      // 使用 Whisper 识别
      const result = await this.model(audioData, {
        language: 'zh',
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30
      });

      logger.log('Recognition result:', result);

      // 提取文本
      let text = '';
      if (typeof result === 'string') {
        text = result;
      } else if (result.text) {
        text = result.text;
      } else if (Array.isArray(result)) {
        text = result.map(r => r.text || r).join(' ');
      }

      // 后处理：添加标点符号（如果缺少）
      if (text.trim() && !/[。！？.!?]$/.test(text)) {
        text += '。';
      }

      // 计算置信度（如果有提供）
      const confidence = result.confidence || 0.8;

      // 计算音频时长
      const audioDuration = audioData.length / 16000; // 采样率 16kHz

      return {
        text: text.trim(),
        confidence,
        startTime: boundary.startTime,
        endTime: boundary.endTime,
        audioDuration,
        audioData: this.retainAudioFiles ? audioData : null
      };
    } catch (error) {
      logger.error('Error transcribing sentence:', error);
      throw error;
    }
  }

  /**
   * 保存录音文件
   * @param {Float32Array} audioData - 音频数据
   * @param {string} recordId - 记录 ID
   * @param {string} conversationId - 对话 ID
   * @param {string} sourceId - 音频源 ID
   * @returns {Promise<string>} 文件路径
   */
  async saveAudioFile(audioData, recordId, conversationId, sourceId) {
    if (!this.retainAudioFiles) {
      return null;
    }

    try {
      // 确保存储目录存在
      const storagePath = this.audioStoragePath || path.join(__dirname, '../../audio_recordings');
      const conversationPath = path.join(storagePath, conversationId);

      if (!fs.existsSync(conversationPath)) {
        fs.mkdirSync(conversationPath, { recursive: true });
      }

      // 生成文件名
      const filename = `${recordId}_${sourceId}.wav`;
      const filePath = path.join(conversationPath, filename);

      // 转换为 WAV 格式并保存
      await this.saveAsWav(audioData, filePath);

      logger.log(`Audio file saved: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error('Error saving audio file:', error);
      return null;
    }
  }

  /**
   * 将音频数据保存为 WAV 文件
   * @param {Float32Array} audioData - 音频数据
   * @param {string} filePath - 文件路径
   */
  async saveAsWav(audioData, filePath) {
    return new Promise((resolve, reject) => {
      try {
        // WAV 文件头（44 字节）
        const buffer = new ArrayBuffer(44 + audioData.length * 2);
        const view = new DataView(buffer);

        // RIFF 标识符
        this.writeString(view, 0, 'RIFF');
        // 文件长度
        view.setUint32(4, 36 + audioData.length * 2, true);
        // WAVE 标识符
        this.writeString(view, 8, 'WAVE');
        // fmt 子块
        this.writeString(view, 12, 'fmt ');
        // 子块大小
        view.setUint32(16, 16, true);
        // 音频格式 (PCM)
        view.setUint16(20, 1, true);
        // 声道数
        view.setUint16(22, 1, true);
        // 采样率
        view.setUint32(24, 16000, true);
        // 字节率
        view.setUint32(28, 16000 * 2, true);
        // 块对齐
        view.setUint16(32, 2, true);
        // 位深度
        view.setUint16(34, 16, true);
        // data 子块
        this.writeString(view, 36, 'data');
        // 数据长度
        view.setUint32(40, audioData.length * 2, true);

        // 写入音频数据
        let offset = 44;
        for (let i = 0; i < audioData.length; i++) {
          const sample = Math.max(-1, Math.min(1, audioData[i]));
          view.setInt16(offset, sample * 0x7FFF, true);
          offset += 2;
        }

        // 写入文件
        fs.writeFileSync(filePath, Buffer.from(buffer));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 将字符串写入 DataView
   * @param {DataView} view - DataView
   * @param {number} offset - 偏移量
   * @param {string} string - 字符串
   */
  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * 销毁服务（释放资源）
   */
  destroy() {
    this.model = null;
    this.vad = null;
    this.audioBuffer = [];
    this.vadResults = [];
    this.isInitialized = false;
    logger.log('WhisperService destroyed');
  }
}

export default WhisperService;
