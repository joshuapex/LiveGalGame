import ASRService from './asr-service.js';
import LocalWhisperService from './local-asr-service.js';
import * as logger from '../utils/logger.js';

class FallbackAwareASRService {
  constructor() {
    this.primary = new ASRService();
    this.fallback = new LocalWhisperService();
    this.currentService = this.primary;
    this.usingFallback = false;
    
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

    // 【临时修改】直接使用本地 Whisper，跳过 WLK
    logger.log('[ASRFactory] Directly initializing Local Whisper (skipping WLK)...');
    await this.switchToFallback();

    /*
    // 【原代码】先试 WLK，失败了再用本地
    try {
      logger.log('[ASRFactory] Initializing Primary ASR (WLK)...');
      // 禁用 primary 的自动重试，由这里接管
      this.primary.maxServerRetries = 0;
      await this.primary.initialize(modelName, options);
      this.currentService = this.primary;
      this.usingFallback = false;
      logger.log('[ASRFactory] Primary ASR initialized successfully');
    } catch (error) {
      logger.warn('[ASRFactory] Primary ASR failed to initialize, switching to Fallback (LocalWorker):', error.message);
      await this.switchToFallback();
    }
    */
  }

  async switchToFallback() {
    if (this.usingFallback) return; // 已经在用 fallback 了

    try {
      await this.fallback.initialize(this._initModelName, this._initOptions);
      this.currentService = this.fallback;
      this.usingFallback = true;
      
      // 重新绑定回调
      if (this._onSentenceComplete) this.currentService.setSentenceCompleteCallback(this._onSentenceComplete);
      if (this._onPartialResult) this.currentService.setPartialResultCallback(this._onPartialResult);
      
      // 绑定 fallback 的崩溃回调
      if (this._onServerCrash) {
          this.currentService.setServerCrashCallback(this._onServerCrash);
      }

      logger.log('[ASRFactory] Switched to Fallback ASR Service');
    } catch (error) {
      logger.error('[ASRFactory] Failed to initialize Fallback ASR:', error);
      throw error; // 两个都失败了，抛出异常
    }
  }

  setServerCrashCallback(callback) {
    this._onServerCrash = callback;

    // 【临时修改】直接使用本地 Whisper，直接设置回调
    if (this.usingFallback) {
      this.fallback.setServerCrashCallback(callback);
    }

    /*
    // 【原代码】为 Primary 设置特殊的崩溃处理：尝试切换到 Fallback
    this.primary.setServerCrashCallback(async (code) => {
      logger.error(`[ASRFactory] Primary ASR crashed (code: ${code}), attempting switch to fallback...`);
      try {
        await this.switchToFallback();
      } catch (e) {
        logger.error('[ASRFactory] Fallback switch failed after crash:', e);
        // 切换失败，通知上层崩溃
        if (callback) callback(code);
      }
    });

    // 如果当前已经是 fallback，直接设置
    if (this.usingFallback) {
      this.fallback.setServerCrashCallback(callback);
    }
    */
  }

  // --- 代理方法 ---

  setSentenceCompleteCallback(callback) {
    this._onSentenceComplete = callback;
    this.currentService.setSentenceCompleteCallback(callback);
  }

  setPartialResultCallback(callback) {
    this._onPartialResult = callback;
    this.currentService.setPartialResultCallback(callback);
  }

  async addAudioChunk(...args) {
    return this.currentService.addAudioChunk(...args);
  }

  async start(...args) {
    // start 方法在 ASRService 中似乎不存在（它是 ASRManager 的方法），
    // 但 ASRService 有 startWhisperLiveKitServer (在 init 里调了)
    // 检查 ASRService 接口，发现没有 start 方法，所以这里不需要代理。
    // 如果 LocalWhisperService 有特殊需求可以在这里加。
    if (this.currentService.start) {
        return this.currentService.start(...args);
    }
  }

  async stop() {
    await this.currentService.stop();
    // 【临时修改】只停止当前使用的服务（本地whisper）
    /*
    // 【原代码】同时确保另一个服务也停止了
    if (this.usingFallback) {
        await this.primary.stop().catch(() => {});
    } else {
        await this.fallback.stop().catch(() => {});
    }
    */
  }

  async destroy() {
    // 【临时修改】只销毁当前使用的服务（本地whisper）
    await this.currentService.destroy().catch(() => {});
    /*
    // 【原代码】销毁所有服务
    await this.primary.destroy().catch(() => {});
    await this.fallback.destroy().catch(() => {});
    */
  }

  async forceCommitSentence(...args) {
    if (this.currentService.forceCommitSentence) {
      return this.currentService.forceCommitSentence(...args);
    }
  }

  async commitSentence(...args) {
    if (this.currentService.commitSentence) {
      return this.currentService.commitSentence(...args);
    }
    return null;
  }

  async saveAudioFile(...args) {
    return this.currentService.saveAudioFile(...args);
  }

  clearContext(...args) {
    if (this.currentService.clearContext) {
      this.currentService.clearContext(...args);
    }
  }
  
  // 代理属性访问（如果需要访问 isInitialized 等）
  get isInitialized() {
      return this.currentService.isInitialized;
  }
  
  get retainAudioFiles() {
      return this.currentService.retainAudioFiles;
  }
}

export async function createWhisperService() {
  return new FallbackAwareASRService();
}

export default createWhisperService;
