import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as logger from '../utils/logger.js';

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建 require 函数用于加载 CommonJS 模块（如 native addon）
const require = createRequire(import.meta.url);

// 尝试加载 whisper.cpp Node.js addon
let whisperAddon = null;
let addonPath = null;

// 尝试多个可能的路径
const possibleAddonPaths = [
  // 开发环境：third_party/whisper.cpp/examples/addon.node
  path.join(__dirname, '../../../third_party/whisper.cpp/examples/addon.node/build/Release/addon.node'),
  path.join(__dirname, '../../../third_party/whisper.cpp/examples/addon.node/build/Debug/addon.node'),
  // 生产环境：打包后的路径
  path.join(__dirname, '../../third_party/whisper.cpp/examples/addon.node/build/Release/addon.node'),
  // 全局安装（如果通过 npm 安装）
  'whisper-cpp-addon'
];

for (const testPath of possibleAddonPaths) {
  try {
    if (testPath === 'whisper-cpp-addon') {
      // 尝试 require（CommonJS）
      whisperAddon = require(testPath);
      addonPath = testPath;
      break;
    } else if (fs.existsSync(testPath)) {
      whisperAddon = require(testPath);
      addonPath = testPath;
      logger.log(`Loaded whisper.cpp addon from: ${testPath}`);
      break;
    }
  } catch (error) {
    // 继续尝试下一个路径
    logger.warn(`Failed to load addon from ${testPath}:`, error.message);
    continue;
  }
}

if (!whisperAddon) {
  logger.warn('Whisper.cpp addon not found. Please compile it first using scripts/setup-whisper-cpp.sh');
  logger.warn('Falling back to error mode - ASR will not work until addon is compiled');
}

/**
 * Whisper.cpp 语音识别服务
 * 使用 whisper.cpp 的 Node.js addon 进行语音识别
 * 模型更小，性能更好
 */
class WhisperService {
  constructor() {
    this.whisper = null;
    this.isInitialized = false;
    this.modelPath = null;
    this.modelName = null;

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

    // 检查 addon 是否可用
    if (!whisperAddon) {
      logger.error('Whisper.cpp addon is not available. Please compile it first.');
      throw new Error('Whisper.cpp addon not found. Run scripts/setup-whisper-cpp.sh to compile.');
    }

    logger.log('WhisperService (whisper.cpp) created');
  }

  /**
   * 初始化模型
   * @param {string} modelName - 模型名称（ggml-base.bin, ggml-tiny.bin, ggml-small.bin）
   * @param {Object} options - 配置选项
   */
  async initialize(modelName = 'ggml-base.bin', options = {}) {
    try {
      logger.log(`Initializing Whisper.cpp model: ${modelName}`);

      // 查找模型文件
      const localModelsDir = path.join(__dirname, '../../models');
      const modelPath = path.join(localModelsDir, modelName);

      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath}\nPlease download the model first.`);
      }

      this.modelPath = modelPath;
      this.modelName = modelName;

      logger.log(`Model path: ${modelPath}`);
      logger.log('Whisper.cpp addon loaded successfully');

      // 配置音频保存选项
      this.retainAudioFiles = options.retainAudioFiles || false;
      this.audioStoragePath = options.audioStoragePath || null;

      this.isInitialized = true;
      logger.log('WhisperService initialized successfully');
      return true;
    } catch (error) {
      logger.error(`Error initializing WhisperService:`, error);
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
    // whisper.cpp 需要 16kHz 单声道 PCM
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

      // 检查是否有完整句子（简化版，实际应该使用 VAD）
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

      if (!this.modelPath) {
        throw new Error('Whisper model not initialized');
      }

      // whisper.cpp addon需要WAV文件作为输入
      // 创建临时WAV文件
      const tempDir = path.join(__dirname, '../../.temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempWavPath = path.join(tempDir, `temp_${Date.now()}.wav`);
      await this.saveAsWav(audioData, tempWavPath);

      try {
        // 使用 promisify 将 whisper 函数转换为 Promise
        const { promisify } = await import('util');
        const whisperAsync = promisify(whisperAddon.whisper);

        // 调用 whisper.cpp 进行识别
        const result = await whisperAsync({
          language: 'zh',
          model: this.modelPath,
          fname_inp: tempWavPath,
          use_gpu: false,
          flash_attn: false,
          no_prints: true,
          translate: false,
          no_timestamps: true,
          detect_language: false
        });

        logger.log('Recognition result:', result);

        // 提取文本
        let text = '';
        if (typeof result === 'string') {
          text = result;
        } else if (result.text) {
          text = result.text;
        } else if (Array.isArray(result) && result.length > 0) {
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
      } finally {
        // 清理临时文件
        if (fs.existsSync(tempWavPath)) {
          fs.unlinkSync(tempWavPath);
        }
      }
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
    if (this.whisper && typeof this.whisper.destroy === 'function') {
      this.whisper.destroy();
    }
    this.whisper = null;
    this.audioBuffer = [];
    this.vadResults = [];
    this.isInitialized = false;
    logger.log('WhisperService destroyed');
  }
}

export default WhisperService;


