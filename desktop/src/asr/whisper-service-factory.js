import ASRService from './asr-service.js';
import LocalWhisperService from './local-asr-service.js';
import FunASRService from './funasr-asr-service.js';
import { ASR_MODEL_PRESETS, getAsrModelPreset } from '../shared/asr-models.js';
import * as logger from '../utils/logger.js';

class FallbackAwareASRService {
  constructor() {
    this.primary = new ASRService();
    this.fallback = new LocalWhisperService();
    this.funasr = new FunASRService();
    this.currentService = null;
    this.usingBackend = null; // 'whisper' or 'funasr'

    // 保存回调引用，以便切换服务时重新绑定
    this._onSentenceComplete = null;
    this._onPartialResult = null;
    this._onServerCrash = null;

    // 保存初始化参数
    this._initModelName = 'medium';
    this._initOptions = {};
  }

  async initialize(modelName, options) {
    this._initModelName = modelName;
    this._initOptions = options;

    // 检测模型类型（faster-whisper 或 funasr）
    const preset = getAsrModelPreset(modelName);
    const engine = preset?.engine || 'faster-whisper';

    if (engine === 'funasr') {
      logger.log(`[ASRFactory] Initializing FunASR service for model: ${modelName}`);
      await this.funasr.initialize(modelName, options);
      this.currentService = this.funasr;
      this.usingBackend = 'funasr';
    } else {
      logger.log(`[ASRFactory] Initializing Faster-Whisper service for model: ${modelName}`);
      await this.switchToFasterWhisper();
    }
  }

  async switchToFasterWhisper() {
    if (this.usingBackend === 'whisper') return;

    try {
      await this.fallback.initialize(this._initModelName, this._initOptions);
      this.currentService = this.fallback;
      this.usingBackend = 'whisper';

      // 重新绑定回调
      if (this._onSentenceComplete) this.currentService.setSentenceCompleteCallback(this._onSentenceComplete);
      if (this._onPartialResult) this.currentService.setPartialResultCallback(this._onPartialResult);

      // 绑定 fallback 的崩溃回调
      if (this._onServerCrash) {
        this.currentService.setServerCrashCallback(this._onServerCrash);
      }

      logger.log('[ASRFactory] Using Faster-Whisper Service');
    } catch (error) {
      logger.error('[ASRFactory] Failed to initialize Faster-Whisper:', error);
      throw error;
    }
  }

  // 兼容性方法，仍支持 switchToFallback 名称
  async switchToFallback() {
    return this.switchToFasterWhisper();
  }

  setServerCrashCallback(callback) {
    this._onServerCrash = callback;

    // 设置当前使用的服务的崩溃回调
    if (this.currentService && typeof this.currentService.setServerCrashCallback === 'function') {
      this.currentService.setServerCrashCallback(callback);
    }
  }

  // --- 代理方法 ---

  setSentenceCompleteCallback(callback) {
    this._onSentenceComplete = callback;
    if (this.currentService) {
      this.currentService.setSentenceCompleteCallback(callback);
    }
  }

  setPartialResultCallback(callback) {
    this._onPartialResult = callback;
    if (this.currentService) {
      this.currentService.setPartialResultCallback(callback);
    }
  }

  async addAudioChunk(...args) {
    if (!this.currentService) {
      throw new Error('ASR service not initialized');
    }
    return this.currentService.addAudioChunk(...args);
  }

  async start(...args) {
    if (!this.currentService) {
      return;
    }
    if (this.currentService.start) {
      return this.currentService.start(...args);
    }
  }

  async stop() {
    if (this.currentService) {
      await this.currentService.stop();
    }
  }

  async destroy() {
    if (this.currentService) {
      await this.currentService.destroy();
    }
  }

  async forceCommitSentence(...args) {
    if (!this.currentService) {
      return;
    }
    if (this.currentService.forceCommitSentence) {
      return this.currentService.forceCommitSentence(...args);
    }
  }

  async commitSentence(...args) {
    if (!this.currentService) {
      return null;
    }
    if (this.currentService.commitSentence) {
      return this.currentService.commitSentence(...args);
    }
    return null;
  }

  async saveAudioFile(...args) {
    if (!this.currentService) {
      return null;
    }
    return this.currentService.saveAudioFile(...args);
  }

  clearContext(...args) {
    if (this.currentService && this.currentService.clearContext) {
      this.currentService.clearContext(...args);
    }
  }

  // 代理属性访问（如果需要访问 isInitialized 等）
  get isInitialized() {
    return this.currentService ? this.currentService.isInitialized : false;
  }

  get retainAudioFiles() {
    return this.currentService ? this.currentService.retainAudioFiles : false;
  }
}

export async function createWhisperService() {
  return new FallbackAwareASRService();
}

export default createWhisperService;