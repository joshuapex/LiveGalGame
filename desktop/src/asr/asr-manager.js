import createWhisperService from './whisper-service-factory.js';
import DatabaseManager from '../db/database.js';
import path from 'path';
import fs from 'fs';
import * as logger from '../utils/logger.js';
import RecognitionCache from './recognition-cache.js';
import { createSentenceHandlers } from './sentence-handlers.js';

/**
 * ASR 管理器（在主进程中运行）
 * 协调 Whisper 服务和数据库操作
 */
class ASRManager {
  constructor(dbInstance = null) {
    this.whisperService = null; // 延迟初始化
    this.db = dbInstance || new DatabaseManager();
    this.isInitialized = false;
    this.isRunning = false;

    // 事件发射器（用于向渲染进程发送事件）
    this.eventEmitter = null;

    // 服务器崩溃回调
    this.onServerCrash = null;
    // 防止并发 initialize 导致重复拉起后端/worker（内存飙升）
    this._initializePromise = null;

    // 当前对话 ID
    this.currentConversationId = null;
    this.modelName = null;

    // 活跃识别任务
    this.activeTranscriptions = new Map(); // sourceId -> Promise

    // 识别结果去重缓存（避免重复保存相同的识别结果）
    this.duplicateThreshold = 3000; // 3秒内的相同文本视为重复
    this.recognitionCache = new RecognitionCache({ duplicateThreshold: this.duplicateThreshold });

    // 【VAD相关】静音检测配置
    this.silenceTimers = new Map(); // sourceId -> timer
    this.SILENCE_TIMEOUT = 1200; // 默认 1.2s 静音判定，后续读取配置
    this.MIN_SENTENCE_LENGTH = 1; // 允许短句保留
    this.MIN_PUNCTUATION_LENGTH = 4; // 标点服务的最小字符数
    this.isSpeaking = false;

    // 【当前分段会话】追踪每个 sourceId 的当前消息（UPSERT 机制）
    // 解决 WhisperLiveKit 发送累积结果导致重复 INSERT 的问题
    this.currentSegments = new Map(); // sourceId -> { messageId, recordId, lastText }
    this.streamingSegments = new Map(); // sourceId -> latest partial text

    const { handleSentenceComplete, handlePartialResult } = createSentenceHandlers(this);
    this.handleSentenceComplete = handleSentenceComplete;
    this.handlePartialResult = handlePartialResult;

    logger.log('ASRManager created');
  }

  /**
   * 设置服务器崩溃回调
   * @param {Function} callback - (exitCode) => void
   */
  setServerCrashCallback(callback) {
    this.onServerCrash = callback;
  }

  /**
   * 设置事件发射器（用于向渲染进程发送事件）
   * @param {Function} emitter - (eventName, data) => void
   */
  setEventEmitter(emitter) {
    this.eventEmitter = emitter;
    logger.log('Event emitter set for ASRManager');
    if (emitter && this.whisperService?.setProgressEmitter) {
      this.whisperService.setProgressEmitter((progress) => this.emitDownloadProgress(progress));
    }
  }

  emitDownloadProgress(progress) {
    if (!this.eventEmitter) {
      return;
    }
    const payload = {
      modelId: progress?.modelId || this.modelName,
      engine: progress?.engine || this.whisperService?.engine,
      source: progress?.source || 'preload',
      ...progress
    };
    this.eventEmitter('asr-model-download-progress', payload);
  }

  /**
   * 初始化 ASR 管理器
   * @param {string} conversationId - 对话 ID
   */
  async initialize(conversationId = null) {
    if (this._initializePromise) {
      return await this._initializePromise;
    }

    this._initializePromise = (async () => {
    try {
      logger.log('Initializing ASRManager...');

      // 创建 WhisperService 实例（如果还没有）
      if (!this.whisperService) {
        this.whisperService = await createWhisperService();

        // 设置服务器崩溃回调
        if (typeof this.whisperService.setServerCrashCallback === 'function') {
          this.whisperService.setServerCrashCallback((exitCode) => {
            logger.error(`[ASRManager] Server crashed with code ${exitCode}`);
            this.isInitialized = false;
            if (this.onServerCrash) {
              this.onServerCrash(exitCode);
            }
          });
        }
      }

      // 获取默认 ASR 配置
      const config = this.db.getDefaultASRConfig();
      if (!config) {
        throw new Error('No default ASR config found');
      }

      logger.log('ASR Config:', config);
      const pauseThresholdSec = Number(config?.sentence_pause_threshold) || 1.2;
      // 仅云端（cloud）或者百度（baidu）允许更低的静音断句阈值；
      // 注意：百度 WebSocket 自带断句，我们这里调高本地兜底阈值，避免干扰百度
      const isCloudModel = String(config?.model_name || '').includes('cloud') || String(config?.model_name || '').includes('baidu');
      const minSilenceMs = isCloudModel ? 3000 : 800; // 如果是云端/百度，本地静音兜底延长到 3s
      this.SILENCE_TIMEOUT = Math.max(minSilenceMs, Math.round(pauseThresholdSec * 1000));
      logger.log(`Silence timeout set to ${this.SILENCE_TIMEOUT}ms based on sentence_pause_threshold=${pauseThresholdSec}`);


      // 确定模型名称：优先使用配置中的值，默认为 'funasr-paraformer' (FunASR)
      // Windows 也默认使用 FunASR ONNX
      let modelName = config.model_name || 'funasr-paraformer';
      this.modelName = modelName;
      logger.log(`Selected ASR model: ${modelName}`);

      if (this.eventEmitter && typeof this.whisperService.setProgressEmitter === 'function') {
        this.whisperService.setProgressEmitter((progress) => this.emitDownloadProgress({
          ...progress,
          modelId: progress?.modelId || modelName
        }));
      }

      // 初始化 Whisper 服务
      // 模型名称直接从配置获取，不再进行特定服务的名称转换
      // 具体的服务实现应该处理模型名称的兼容性，或者由用户在设置中选择正确的模型
      await this.whisperService.initialize(modelName, {
        retainAudioFiles: config.retain_audio_files === 1,
        audioStoragePath: config.audio_storage_path
      });

      // 【混合分句】注册句子完成回调
      if (typeof this.whisperService.setSentenceCompleteCallback === 'function') {
        this.whisperService.setSentenceCompleteCallback(async (result) => {
          await this.handleSentenceComplete(result);
        });
        logger.log('Registered sentence_complete callback');
      }

      // 【混合分句】注册实时字幕回调
      if (typeof this.whisperService.setPartialResultCallback === 'function') {
        this.whisperService.setPartialResultCallback((result) => {
          this.handlePartialResult(result);
        });
        logger.log('Registered partial_result callback');
      }

      // 设置当前对话 ID
      this.currentConversationId = conversationId;



      this.isInitialized = true;
      logger.log('ASRManager initialized successfully');

      return true;
    } catch (error) {
      logger.error('Error initializing ASRManager:', error);
      throw error;
    }
    })().finally(() => {
      this._initializePromise = null;
    });

    return await this._initializePromise;
  }

  /**
   * 处理音频数据（从渲染进程接收）
   * @param {Object} data - 音频数据
   * @returns {Promise<Object|null>} 识别结果
   */
  async processAudioData(data) {
    try {
      const { sourceId, audioBuffer, timestamp } = data;

      if (!this.isInitialized) {
        throw new Error('ASRManager not initialized');
      }

      // 调用 Whisper 服务处理音频块
      const float32Array = new Float32Array(audioBuffer);
      const result = await this.whisperService.addAudioChunk(float32Array, timestamp, sourceId);

      // 处理流式结果（VAD 逻辑）
      if (result && (result.isPartial || result.isSpeaking)) {
        return await this.processStreamingResult(sourceId, result, timestamp);
      }

      // 如果识别到完整句子，检查是否重复后再保存
      if (result && result.text) {
        // 检查是否是重复的识别结果
        if (this.isDuplicateRecognition(sourceId, result.text, result.endTime)) {
          logger.log(`跳过重复的识别结果: "${result.text}" (${sourceId})`);
          return null;
        }

        // 检查文本是否有效（过滤掉空文本、纯标点、过短文本）
        const trimmedText = result.text.trim();
        if (!trimmedText) {
          logger.log(`跳过无效的识别结果: "${trimmedText}" (${sourceId})`);
          return null;
        }

        const normalizedResult = this.normalizeText(trimmedText);
        // 先使用未加标点的文本，后续异步补标点
        result.text = normalizedResult;
        const record = await this.saveRecognitionRecord(sourceId, result);

        // 添加到去重缓存
        this.addToRecognitionCache(sourceId, normalizedResult, result.endTime);

        return {
          ...result,
          recordId: record.id,
          sourceId
        };
      }

      return null;
    } catch (error) {
      logger.error('Error processing audio data:', error);
      throw error;
    }
  }

  /**
   * 处理流式识别结果（带 VAD 逻辑）
   * 【混合分句】现在主要作为静音检测的兜底机制
   * @param {string} sourceId - 音频源 ID
   * @param {Object} result - 识别结果
   * @param {number} timestamp - 时间戳
   * @returns {Promise<Object|null>} 消息记录
   */
  async processStreamingResult(sourceId, result, timestamp) {
    try {
      // 检查是否有有效的识别结果
      if (!result) {
        return null;
      }

      const partialText = result.partialText ? result.partialText.trim() : '';

      // 如果用户正在说话，清除静音定时器
      if (result.isSpeaking) {
        const existingTimer = this.silenceTimers.get(sourceId);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        this.isSpeaking = true;

        // 【混合分句】静音检测作为兜底机制
        // Python 端会主动通过 sentence_complete 事件提交句子
        // 这里的静音检测用于处理：
        // 1. 用户说话结束但没有句末标点的情况
        // 2. Whisper segment 边界检测失败的情况
        const timer = setTimeout(() => this.triggerSilenceCommit(sourceId), this.SILENCE_TIMEOUT);
        this.silenceTimers.set(sourceId, timer);

        return null; // 不存库，只用于UI展示
      }

      return null;
    } catch (error) {
      logger.error('Error processing streaming result:', error);
      return null;
    }
  }

  /**
   * 【混合分句】静音超时触发的强制提交
   * @param {string} sourceId - 音频源 ID
   */
  async triggerSilenceCommit(sourceId) {
    try {
      const pendingTimer = this.silenceTimers.get(sourceId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.silenceTimers.delete(sourceId);
      }

      // 【斩断当前分段】静音意味着当前这句话结束，下一条是新消息
      this.commitCurrentSegment(sourceId);

      // 检查服务是否支持 forceCommitSentence
      if (typeof this.whisperService.forceCommitSentence === 'function') {
        logger.log(`[Silence Timeout] Triggering force commit for ${sourceId}`);
        await this.whisperService.forceCommitSentence(sourceId);
      } else {
        // 回退到旧的 finalizeSentence 逻辑
        return await this.finalizeSentence(sourceId);
      }
    } catch (error) {
      logger.error('Error in triggerSilenceCommit:', error);
    }
  }

  /**
   * 【斩断当前分段】将 currentMessageId 重置为 null
   * 表示"这句话彻底结束了，下一条是新消息"
   * @param {string} sourceId - 音频源 ID
   */
  commitCurrentSegment(sourceId) {
    const currentSegment = this.currentSegments.get(sourceId);
    if (currentSegment) {
      logger.log(`[Commit Segment] Committing segment for ${sourceId}, message: ${currentSegment.messageId}`);
      this.currentSegments.delete(sourceId);
      this.clearStreamingSegment(sourceId);
    }
  }

  /**
   * 【斩断所有分段】停止识别或切换对话时调用
   */
  commitAllSegments() {
    for (const sourceId of this.currentSegments.keys()) {
      this.commitCurrentSegment(sourceId);
    }
  }

  emitStreamingUpdate(sourceId, text, timestamp) {
    if (!sourceId || !text) {
      return;
    }
    this.streamingSegments.set(sourceId, { text, timestamp });
    if (this.eventEmitter) {
      this.eventEmitter('asr-partial-update', {
        sessionId: sourceId,
        sourceId,
        content: text,
        timestamp,
        conversationId: this.currentConversationId
      });
    }
  }

  clearStreamingSegment(sourceId) {
    if (!sourceId || !this.streamingSegments.has(sourceId)) {
      return;
    }
    this.streamingSegments.delete(sourceId);
    if (this.eventEmitter) {
      this.eventEmitter('asr-partial-clear', {
        sessionId: sourceId,
        sourceId
      });
    }
  }

  /**
   * 句子结束处理函数（VAD 触发）
   * 【2-Pass】使用高精度非流式模型对整句进行重新识别
   * @param {string} sourceId - 音频源 ID
   */
  async finalizeSentence(sourceId) {
    try {
      const pendingTimer = this.silenceTimers.get(sourceId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        this.silenceTimers.delete(sourceId);
      }

      // 检查服务是否支持 commitSentence
      if (typeof this.whisperService.commitSentence !== 'function') {
        logger.warn('finalizeSentence is not supported by the current service');
        return null;
      }

      // 【2-Pass】调用 Service 的提交方法，获取高精度识别结果
      const result = await this.whisperService.commitSentence(sourceId);

      if (!result) {
        return null;
      }

      const { streamingText, finalText, is2Pass } = result;

      if (is2Pass) {
        logger.log(`[2-Pass] Streaming: "${streamingText?.substring(0, 30)}..." -> Final: "${finalText?.substring(0, 30)}..."`);
      }

      if (finalText && finalText.length > 1) { // 过滤掉单字噪音
        logger.log(`Final sentence: "${finalText}" (${sourceId}, 2-pass: ${is2Pass})`);

        // 检查是否是重复的识别结果
        if (this.isDuplicateRecognition(sourceId, finalText, Date.now())) {
          logger.log(`跳过重复的识别结果: "${finalText}" (${sourceId})`);
          return null;
        }

        // 【存库】此时才执行 INSERT
        const normalizedText = this.normalizeText(finalText);
        logger.log(`Normalized text: "${normalizedText}" (length: ${normalizedText.length})`);

        // 先保存未加标点的文本，异步补标点
        if (!normalizedText || !normalizedText.trim()) {
          logger.log(`Final sentence empty after normalization, skip saving: "${normalizedText}"`);
          return null;
        }

        logger.log(`Saving recognition record for conversation: ${this.currentConversationId}`);
        const record = await this.saveRecognitionRecord(sourceId, {
          text: normalizedText,
          confidence: is2Pass ? 0.98 : 0.95, // 2-pass 结果置信度更高
          startTime: Date.now() - this.SILENCE_TIMEOUT,
          endTime: Date.now(),
          audioDuration: this.SILENCE_TIMEOUT / 1000,
          isPartial: false,
          audioData: null
        });

        if (!record) {
          logger.error(`Failed to save recognition record for: "${normalizedText}"`);
          return null;
        }

        logger.log(`Recognition record saved: ${record.id}`);

        // 添加到去重缓存
        this.addToRecognitionCache(sourceId, normalizedText, Date.now());

        // 【UI更新】发送正式消息
        const message = await this.convertRecordToMessage(record.id, this.currentConversationId);
        logger.log(`Message created from speech: ${message.id}`);

        // 异步补标点并更新
        this.enqueuePunctuationUpdate({
          recordId: record.id,
          messageId: message.id,
          text: normalizedText,
          sourceId
        });

        return message;
      }
      return null;
    } catch (error) {
      logger.error('Error finalizing sentence:', error);
      return null;
    }
  }

  /**
   * 保存语音识别记录到数据库
   * @param {string} sourceId - 音频源 ID
   * @param {Object} result - 识别结果
   * @returns {Promise<Object>} 数据库记录
   */
  async saveRecognitionRecord(sourceId, result) {
    try {
      // 检查对话ID是否存在
      if (!this.currentConversationId) {
        throw new Error('No conversation ID set. Cannot save speech record.');
      }

      // 保存音频文件（如果需要）
      let audioFilePath = null;
      if (result.audioData && this.whisperService.retainAudioFiles) {
        const recordId = this.generateId();
        audioFilePath = await this.whisperService.saveAudioFile(
          result.audioData,
          recordId,
          this.currentConversationId,
          sourceId
        );
      }

      // 保存记录到数据库
      const normalizedText = this.normalizeText(result.text);
      if (!normalizedText) {
        logger.log(`Normalized text did not pass validation, skip saving. Raw: "${result.text}"`);
        return null;
      }

      const record = this.db.saveSpeechRecord({
        conversation_id: this.currentConversationId,
        source_id: sourceId,
        audio_file_path: audioFilePath,
        audio_duration: result.audioDuration,
        recognized_text: normalizedText,
        confidence: result.confidence,
        start_time: result.startTime,
        end_time: result.endTime,
        status: 'completed'
      });

      logger.log(`Speech record saved: ${record.id}, text: ${result.text.substring(0, 50)}...`);

      return record;
    } catch (error) {
      logger.error('Error saving recognition record:', error);
      // 如果是外键约束错误，提供更友好的错误信息
      if (error.message && error.message.includes('Conversation not found')) {
        throw new Error(`对话不存在（ID: ${this.currentConversationId}），无法保存语音识别记录。请确保已创建对话后再开始语音识别。`);
      }
      throw error;
    }
  }

  /**
   * 将语音识别记录转换为消息
   * @param {string} recordId - 语音识别记录 ID
   * @param {string} conversationId - 对话 ID
   * @returns {Promise<Object>} 消息记录
   */
  async convertRecordToMessage(recordId, conversationId) {
    try {
      // 查询语音识别记录
      const record = this.db.getSpeechRecordById(recordId);
      if (!record) {
        throw new Error(`Speech record not found: ${recordId}`);
      }

      // 根据 sourceId 判断 sender（user/character）
      // 默认规则：speaker1 -> user, speaker2 -> character
      const sender = record.source_id === 'speaker1' ? 'user' : 'character';

      // 创建消息记录
      const message = this.db.createMessage({
        conversation_id: conversationId,
        sender: sender,
        content: record.recognized_text,
        timestamp: record.end_time || Date.now()
      });

      // 更新语音识别记录，关联 message_id
      this.db.updateSpeechRecord(recordId, {
        message_id: message.id
      });

      logger.log(`Speech record converted to message: ${message.id}`);

      return message;
    } catch (error) {
      logger.error('Error converting record to message:', error);
      throw error;
    }
  }

  /**
   * 获取对话的语音识别记录
   * @param {string} conversationId - 对话 ID
   * @returns {Array} 识别记录列表
   */
  getSpeechRecords(conversationId) {
    return this.db.getSpeechRecordsByConversation(conversationId);
  }

  /**
   * 开始语音识别
   * @param {string} conversationId - 对话 ID
   */
  async start(conversationId = null) {
    try {
      if (this.isRunning) {
        logger.log('ASR is already running');
        // 如果对话ID变化，更新它并清理上下文
        if (conversationId && conversationId !== this.currentConversationId) {
          logger.log(`Conversation changed from ${this.currentConversationId} to ${conversationId}, clearing context`);

          // 【斩断所有分段】切换对话前提交所有进行中的分段
          this.commitAllSegments();

          this.currentConversationId = conversationId;

          // 【自动上下文学习】切换对话时清理旧上下文
          if (typeof this.whisperService.clearContext === 'function') {
            this.whisperService.clearContext('speaker1');
            this.whisperService.clearContext('speaker2');
          }
        }
        return;
      }

      if (!this.isInitialized) {
        await this.initialize(conversationId);
      }

      this.currentConversationId = conversationId || this.currentConversationId;
      this.isRunning = true;

      // 重置 session 状态
      if (typeof this.whisperService.sendResetCommand === 'function') {
        await this.whisperService.sendResetCommand('speaker1');
        await this.whisperService.sendResetCommand('speaker2');
      }

      // 【自动上下文学习】新对话开始时清理旧上下文
      if (typeof this.whisperService.clearContext === 'function') {
        this.whisperService.clearContext('speaker1');
        this.whisperService.clearContext('speaker2');
      }

      logger.log('ASR started');
    } catch (error) {
      logger.error('Error starting ASR:', error);
      throw error;
    }
  }

  /**
   * 停止语音识别
   */
  async stop() {
    try {
      if (!this.isRunning) {
        logger.log('ASR is not running');
        return;
      }

      this.isRunning = false;

      // 清除静音定时器
      this.clearAllSilenceTimers();

      // 【斩断所有分段】停止时提交所有进行中的分段
      this.commitAllSegments();

      // 【清理】通知后端关闭所有会话连接，避免产生 -3101 等超时报错
      if (typeof this.whisperService.sendResetCommand === 'function') {
        await this.whisperService.sendResetCommand('speaker1');
        await this.whisperService.sendResetCommand('speaker2');
      }

      logger.log('ASR stopped');
    } catch (error) {
      logger.error('Error stopping ASR:', error);
      throw error;
    }
  }

  /**
   * 清理过期的音频文件
   * @param {number} retentionDays - 保留天数
   * @returns {number} 删除的文件数量
   */
  cleanupExpiredAudioFiles(retentionDays) {
    try {
      const deletedCount = this.db.cleanupExpiredAudioFiles(retentionDays);
      logger.log(`Cleaned up ${deletedCount} expired audio files`);
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up expired audio files:', error);
      return 0;
    }
  }

  /**
   * 检查是否是重复的识别结果
   * @param {string} sourceId - 音频源ID
   * @param {string} text - 识别文本
   * @param {number} timestamp - 时间戳
   * @returns {boolean} 是否是重复
   */
  isDuplicateRecognition(sourceId, text, timestamp) {
    return this.recognitionCache.isDuplicate(sourceId, text, timestamp);
  }

  /**
   * 添加到识别结果缓存
   * @param {string} sourceId - 音频源ID
   * @param {string} text - 识别文本
   * @param {number} timestamp - 时间戳
   */
  addToRecognitionCache(sourceId, text, timestamp) {
    this.recognitionCache.add(sourceId, text, timestamp);
  }

  /**
   * 清洗文本，移除中文字符之间的多余空格，并规范空白
   * @param {string} text
   * @returns {string}
   */
  normalizeText(text) {
    return this.recognitionCache.normalizeText(text);
  }

  /**
   * 去重比较用的文本规范化
   * @param {string} text
   * @returns {string}
   */
  normalizeForComparison(text) {
    return this.recognitionCache.normalizeForComparison(text);
  }

  async applyPunctuationIfAvailable(text, sourceId) {
    const service = this.whisperService;
    if (
      !service ||
      typeof service.punctuateText !== 'function' ||
      !text ||
      text.length < this.MIN_PUNCTUATION_LENGTH
    ) {
      logger.log(`Skipping punctuation: service=${!!service}, hasMethod=${typeof service?.punctuateText === 'function'}, textLength=${text?.length || 0}, minLength=${this.MIN_PUNCTUATION_LENGTH}`);
      return text;
    }

    try {
      logger.log(`Calling punctuation service for text length: ${text.length}`);
      // 添加超时处理，避免卡住（增加到10秒，因为标点处理可能需要时间）
      let punctuated;
      try {
        punctuated = await Promise.race([
          service.punctuateText(text, sourceId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Punctuation timeout after 10s')), 10000))
        ]);
        logger.log(`Punctuation result received, length: ${punctuated?.length || 0}`);
      } catch (timeoutError) {
        logger.warn(`Punctuation service timeout or error: ${timeoutError.message}, using original text`);
        return text;
      }
      if (punctuated && punctuated.trim().length >= this.MIN_SENTENCE_LENGTH) {
        return punctuated.trim();
      }
    } catch (error) {
      logger.warn(`Punctuation service failed: ${error.message}, falling back to original text`);
    }

    return text;
  }

  /**
   * 异步补标点并更新记录与消息
   */
  enqueuePunctuationUpdate({ recordId, messageId, text, sourceId }) {
    if (!text || !recordId || !messageId) return;
    (async () => {
      try {
        const punctuated = await this.applyPunctuationIfAvailable(text, sourceId);
        if (!punctuated || punctuated === text) {
          return;
        }
        // 更新语音记录
        this.db.updateSpeechRecord(recordId, {
          recognized_text: punctuated
        });
        // 更新消息
        const updatedMessage = this.db.updateMessage(messageId, {
          content: punctuated
        });
        if (updatedMessage && this.eventEmitter) {
          updatedMessage.source_id = sourceId;
          this.eventEmitter('asr-sentence-update', updatedMessage);
        }
      } catch (err) {
        logger.warn(`Punctuation async update failed: ${err.message}`);
      }
    })();
  }

  clearAllSilenceTimers() {
    for (const timer of this.silenceTimers.values()) {
      clearTimeout(timer);
    }
    this.silenceTimers.clear();
  }

  /**
   * 生成唯一 ID
   * @returns {string} UUID
   */
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 销毁管理器（释放资源）
   */
  destroy() {
    this.stop();
    this.clearAllSilenceTimers();
    this.whisperService.destroy();
    this.db.close();
    this.isInitialized = false;
    logger.log('ASRManager destroyed');
  }
}

export default ASRManager;
