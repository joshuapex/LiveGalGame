import createWhisperService from './whisper-service-factory.js';
import DatabaseManager from '../db/database.js';
import path from 'path';
import fs from 'fs';
import * as logger from '../utils/logger.js';

/**
 * ASR 管理器（在主进程中运行）
 * 协调 Whisper 服务和数据库操作
 */
class ASRManager {
  constructor() {
    this.whisperService = null; // 延迟初始化
    this.db = new DatabaseManager();
    this.isInitialized = false;
    this.isRunning = false;

    // 音频缓冲区（存储来自渲染进程的音频数据）
    this.audioBuffers = new Map(); // sourceId -> { buffer: [], lastUpdate: timestamp }

    // 当前对话 ID
    this.currentConversationId = null;

    // 活跃识别任务
    this.activeTranscriptions = new Map(); // sourceId -> Promise

    logger.log('ASRManager created');
  }

  /**
   * 初始化 ASR 管理器
   * @param {string} conversationId - 对话 ID
   */
  async initialize(conversationId = null) {
    try {
      logger.log('Initializing ASRManager...');

      // 创建 WhisperService 实例（如果还没有）
      if (!this.whisperService) {
        this.whisperService = await createWhisperService();
      }

      // 获取默认 ASR 配置
      const config = this.db.getDefaultASRConfig();
      if (!config) {
        throw new Error('No default ASR config found');
      }

      logger.log('ASR Config:', config);


      // 检查使用的是哪种实现
      const isWhisperCpp = this.whisperService.constructor.name === 'WhisperServiceCLI' ||
        (this.whisperService.constructor.name === 'WhisperService' &&
          this.whisperService.whisper !== undefined);

      // 转换模型名称（仅对 whisper.cpp/CLI）
      let modelName = config.model_name;
      if (isWhisperCpp) {
        if (modelName.startsWith('ggml-')) {
          // 已经是 GGML 格式
        } else if (modelName.startsWith('whisper-')) {
          // 转换 transformers.js 格式到 GGML 格式
          modelName = `ggml-${modelName.replace('whisper-', '')}.bin`;
        }
        logger.log(`Using whisper.cpp/CLI with model: ${modelName}`);
      } else {
        // transformers.js - 保持原始格式
        logger.log(`Using transformers.js with model: ${modelName}`);
      }

      // 初始化 Whisper 服务
      await this.whisperService.initialize(modelName, {
        retainAudioFiles: config.retain_audio_files === 1,
        audioStoragePath: config.audio_storage_path
      });

      // 设置当前对话 ID
      this.currentConversationId = conversationId;

      // 初始化音频缓冲区
      this.audioBuffers.set('speaker1', { buffer: [], lastUpdate: 0 });
      this.audioBuffers.set('speaker2', { buffer: [], lastUpdate: 0 });

      this.isInitialized = true;
      logger.log('ASRManager initialized successfully');

      return true;
    } catch (error) {
      logger.error('Error initializing ASRManager:', error);
      throw error;
    }
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

      // 更新音频缓冲区
      const bufferInfo = this.audioBuffers.get(sourceId);
      if (!bufferInfo) {
        logger.warn(`Unknown sourceId: ${sourceId}`);
        return null;
      }

      // 累积音频数据
      bufferInfo.buffer.push(...audioBuffer);
      bufferInfo.lastUpdate = timestamp;

      // 调用 Whisper 服务处理音频块
      const float32Array = new Float32Array(audioBuffer);
      const result = await this.whisperService.addAudioChunk(float32Array, timestamp);

      // 如果识别到完整句子，保存到数据库并返回结果
      if (result && result.text) {
        const record = await this.saveRecognitionRecord(sourceId, result);
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
   * 保存语音识别记录到数据库
   * @param {string} sourceId - 音频源 ID
   * @param {Object} result - 识别结果
   * @returns {Promise<Object>} 数据库记录
   */
  async saveRecognitionRecord(sourceId, result) {
    try {
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
      const record = this.db.saveSpeechRecord({
        conversation_id: this.currentConversationId,
        source_id: sourceId,
        audio_file_path: audioFilePath,
        audio_duration: result.audioDuration,
        recognized_text: result.text,
        confidence: result.confidence,
        start_time: result.startTime,
        end_time: result.endTime,
        status: 'completed'
      });

      logger.log(`Speech record saved: ${record.id}, text: ${result.text.substring(0, 50)}...`);

      return record;
    } catch (error) {
      logger.error('Error saving recognition record:', error);
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
        return;
      }

      if (!this.isInitialized) {
        await this.initialize(conversationId);
      }

      this.currentConversationId = conversationId || this.currentConversationId;
      this.isRunning = true;

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

      // 清空音频缓冲区
      this.audioBuffers.clear();

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
    this.whisperService.destroy();
    this.db.close();
    this.isInitialized = false;
    logger.log('ASRManager destroyed');
  }
}

export default ASRManager;
