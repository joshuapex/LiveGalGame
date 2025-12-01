import electron from 'electron';
import DatabaseManager from '../../db/database.js';
import ASRManager from '../../asr/asr-manager.js';
import ASRModelManager from '../../asr/model-manager.js';

const { ipcMain, systemPreferences } = electron;

/**
 * IPC 处理器管理器 - 负责注册所有 IPC 通信处理器
 */
export class IPCManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.db = null;
    this.modelManager = null;
    this.asrManager = null;
    this.asrModelPreloading = false;
    this.asrModelPreloaded = false;
    this.asrServerCrashCallback = null;
  }

  /**
   * 设置 ASR 事件发射器
   */
  setASREventEmitter(emitASREvent) {
    this.emitASREvent = emitASREvent;
  }

  /**
   * 设置服务器崩溃回调
   */
  setASRServerCrashCallback(callback) {
    this.asrServerCrashCallback = callback;
  }

  /**
   * 初始化数据库管理器
   */
  initDatabase() {
    if (!this.db) {
      this.db = new DatabaseManager();
    }
  }

  /**
   * 初始化模型管理器
   */
  initModelManager() {
    if (!this.modelManager) {
      this.modelManager = new ASRModelManager();
    }
  }

  /**
   * 注册所有 IPC 处理器
   */
  registerHandlers() {
    console.log('Registering IPC handlers...');

    this.initDatabase();
    this.initModelManager();
    this.setupWindowHandlers();
    this.setupDatabaseHandlers();
    this.setupLLMHandlers();
    this.setupASRModelHandlers();
    this.setupASRAudioHandlers();
    this.setupMediaHandlers();

    console.log('All IPC handlers registered');
  }

  /**
   * 设置窗口相关 IPC 处理器
   */
  setupWindowHandlers() {
    // 显示HUD
    ipcMain.on('show-hud', async () => {
      if (!this.windowManager.getHUDWindow()) {
        await this.windowManager.createHUDWindow(
          () => this.checkASRReady(),
          () => {}
        );
      } else {
        this.windowManager.showHUD();
      }
      console.log('HUD显示');
    });

    // 隐藏HUD
    ipcMain.on('hide-hud', () => {
      this.windowManager.hideHUD();
      console.log('HUD隐藏');
    });

    // 关闭HUD
    ipcMain.on('close-hud', () => {
      this.windowManager.closeHUD();
      console.log('HUD关闭');
    });

    // HUD拖拽相关
    ipcMain.on('start-hud-drag', (event, pos) => {
      this.windowManager.startHUDrag(pos);
    });

    ipcMain.on('update-hud-drag', (event, pos) => {
      this.windowManager.updateHUDrag(pos);
    });

    ipcMain.on('end-hud-drag', () => {
      this.windowManager.endHUDrag();
    });

    // 主窗口控制
    ipcMain.on('minimize-window', () => {
      this.windowManager.minimizeMainWindow();
    });

    ipcMain.on('close-window', () => {
      this.windowManager.closeMainWindow();
    });

    // 主窗口拖拽相关
    ipcMain.on('start-drag', (event, pos) => {
      this.windowManager.startMainDrag(pos);
    });

    ipcMain.on('update-drag', (event, pos) => {
      this.windowManager.updateMainDrag(pos);
    });

    ipcMain.on('end-drag', () => {
      this.windowManager.endMainDrag();
    });

    console.log('Window IPC handlers registered');
  }

  /**
   * 设置数据库相关 IPC 处理器
   */
  setupDatabaseHandlers() {
    // 获取所有角色
    ipcMain.handle('db-get-all-characters', () => {
      try {
        return this.db.getAllCharacters();
      } catch (error) {
        console.error('Error getting all characters:', error);
        return [];
      }
    });

    // 获取单个角色
    ipcMain.handle('db-get-character-by-id', (event, id) => {
      try {
        return this.db.getCharacterById(id);
      } catch (error) {
        console.error('Error getting character:', error);
        return null;
      }
    });

    // 创建角色
    ipcMain.handle('db-create-character', (event, characterData) => {
      try {
        return this.db.createCharacter(characterData);
      } catch (error) {
        console.error('Error creating character:', error);
        return null;
      }
    });

    // 创建对话
    ipcMain.handle('db-create-conversation', (event, conversationData) => {
      try {
        return this.db.createConversation(conversationData);
      } catch (error) {
        console.error('Error creating conversation:', error);
        return null;
      }
    });

    // 获取角色的对话
    ipcMain.handle('db-get-conversations-by-character', (event, characterId) => {
      try {
        return this.db.getConversationsByCharacter(characterId);
      } catch (error) {
        console.error('Error getting conversations:', error);
        return [];
      }
    });

    // 创建消息
    ipcMain.handle('db-create-message', (event, messageData) => {
      try {
        return this.db.createMessage(messageData);
      } catch (error) {
        console.error('Error creating message:', error);
        return null;
      }
    });

    // 获取对话的消息
    ipcMain.handle('db-get-messages-by-conversation', (event, conversationId) => {
      try {
        return this.db.getMessagesByConversation(conversationId);
      } catch (error) {
        console.error('Error getting messages:', error);
        return [];
      }
    });

    // 更新对话
    ipcMain.handle('db-update-conversation', (event, conversationId, updates) => {
      try {
        return this.db.updateConversation(conversationId, updates);
      } catch (error) {
        console.error('Error updating conversation:', error);
        return null;
      }
    });

    // 获取统计数据
    ipcMain.handle('db-get-statistics', () => {
      try {
        return this.db.getStatistics();
      } catch (error) {
        try {
          console.error('Error getting statistics:', error);
        } catch (logError) {
          // 如果 console.error 也失败，忽略
        }
        return {
          characterCount: 0,
          conversationCount: 0,
          messageCount: 0,
          avgAffinity: 0
        };
      }
    });

    // 获取角色页面统计数据
    ipcMain.handle('db-get-character-page-statistics', () => {
      try {
        return this.db.getCharacterPageStatistics();
      } catch (error) {
        console.error('Error getting character page statistics:', error);
        return {
          characterCount: 0,
          activeConversationCount: 0,
          avgAffinity: 0
        };
      }
    });

    // 获取最近对话
    ipcMain.handle('db-get-recent-conversations', (event, limit) => {
      try {
        return this.db.getRecentConversations(limit || 10);
      } catch (error) {
        console.error('Error getting recent conversations:', error);
        return [];
      }
    });

    // 获取所有对话
    ipcMain.handle('db-get-all-conversations', () => {
      try {
        return this.db.getAllConversations();
      } catch (error) {
        console.error('Error getting all conversations:', error);
        return [];
      }
    });

    // 更新消息
    ipcMain.handle('db-update-message', (event, messageId, updates) => {
      try {
        return this.db.updateMessage(messageId, updates);
      } catch (error) {
        console.error('Error updating message:', error);
        return null;
      }
    });

    // 获取对话的AI分析数据
    ipcMain.handle('db-get-conversation-ai-data', (event, conversationId) => {
      try {
        return this.db.getConversationAIData(conversationId);
      } catch (error) {
        console.error('Error getting conversation AI data:', error);
        return {
          analysisReport: null,
          keyMoments: [],
          personalityAnalysis: null,
          actionSuggestions: []
        };
      }
    });

    // 获取角色详情
    ipcMain.handle('db-get-character-details', (event, characterId) => {
      try {
        return this.db.getCharacterDetails(characterId);
      } catch (error) {
        console.error('Error getting character details:', error);
        return null;
      }
    });

    // 更新角色详情的自定义字段
    ipcMain.handle('db-update-character-details-custom-fields', (event, characterId, customFields) => {
      try {
        return this.db.updateCharacterDetailsCustomFields(characterId, customFields);
      } catch (error) {
        console.error('Error updating character details custom fields:', error);
        return false;
      }
    });

    // 重新生成角色详情（从会话中）
    ipcMain.handle('db-regenerate-character-details', (event, characterId) => {
      try {
        return this.db.generateCharacterDetailsFromConversations(characterId);
      } catch (error) {
        console.error('Error regenerating character details:', error);
        return null;
      }
    });

    // 删除对话
    ipcMain.handle('db-delete-conversation', (event, conversationId) => {
      try {
        return this.db.deleteConversation(conversationId);
      } catch (error) {
        console.error('Error deleting conversation:', error);
        return false;
      }
    });

    // 删除角色
    ipcMain.handle('db-delete-character', (event, characterId) => {
      try {
        return this.db.deleteCharacter(characterId);
      } catch (error) {
        console.error('Error deleting character:', error);
        return false;
      }
    });

    console.log('Database IPC handlers registered');
  }

  /**
   * 设置 LLM 配置相关 IPC 处理器
   */
  setupLLMHandlers() {
    // 保存LLM配置
    ipcMain.handle('llm-save-config', (event, configData) => {
      try {
        return this.db.saveLLMConfig(configData);
      } catch (error) {
        console.error('Error saving LLM config:', error);
        throw error;
      }
    });

    // 获取所有LLM配置
    ipcMain.handle('llm-get-all-configs', () => {
      try {
        return this.db.getAllLLMConfigs();
      } catch (error) {
        console.error('Error getting LLM configs:', error);
        return [];
      }
    });

    // 获取默认LLM配置
    ipcMain.handle('llm-get-default-config', () => {
      try {
        return this.db.getDefaultLLMConfig();
      } catch (error) {
        console.error('Error getting default LLM config:', error);
        return null;
      }
    });

    // 获取指定ID的LLM配置
    ipcMain.handle('llm-get-config-by-id', (event, id) => {
      try {
        return this.db.getLLMConfigById(id);
      } catch (error) {
        console.error('Error getting LLM config:', error);
        return null;
      }
    });

    // 删除LLM配置
    ipcMain.handle('llm-delete-config', (event, id) => {
      try {
        return this.db.deleteLLMConfig(id);
      } catch (error) {
        console.error('Error deleting LLM config:', error);
        throw error;
      }
    });

    // 测试LLM连接
    ipcMain.handle('llm-test-connection', async (event, configData) => {
      try {
        return await this.db.testLLMConnection(configData);
      } catch (error) {
        console.error('Error testing LLM connection:', error);
        return { success: false, message: error.message || '连接测试失败' };
      }
    });

    // 设置默认LLM配置
    ipcMain.handle('llm-set-default-config', (event, id) => {
      try {
        return this.db.setDefaultLLMConfig(id);
      } catch (error) {
        console.error('Error setting default LLM config:', error);
        throw error;
      }
    });

    console.log('LLM IPC handlers registered');
  }

  /**
   * 设置 ASR 模型管理相关 IPC 处理器
   */
  setupASRModelHandlers() {
    ipcMain.handle('asr-get-model-presets', () => {
      try {
        return this.modelManager.getModelPresets();
      } catch (error) {
        console.error('Error getting ASR model presets:', error);
        return [];
      }
    });

    ipcMain.handle('asr-get-model-status', (event, modelId) => {
      try {
        return this.modelManager.getModelStatus(modelId);
      } catch (error) {
        console.error('Error getting ASR model status:', error);
        return null;
      }
    });

    ipcMain.handle('asr-get-all-model-statuses', () => {
      try {
        return this.modelManager.getAllModelStatuses();
      } catch (error) {
        console.error('Error getting ASR model statuses:', error);
        return [];
      }
    });

    ipcMain.handle('asr-download-model', (event, modelId, source) => {
      try {
        return this.modelManager.startDownload(modelId, source);
      } catch (error) {
        console.error('Error starting ASR model download:', error);
        throw error;
      }
    });

    ipcMain.handle('asr-cancel-model-download', (event, modelId) => {
      try {
        return this.modelManager.cancelDownload(modelId);
      } catch (error) {
        console.error('Error cancelling ASR model download:', error);
        throw error;
      }
    });

    console.log('ASR Model IPC handlers registered');
  }

  /**
   * 设置 ASR 音频处理相关 IPC 处理器
   */
  setupASRAudioHandlers() {
    // 初始化 ASR 管理器
    ipcMain.handle('asr-initialize', async (event, conversationId) => {
      try {
        this.asrManager = this.getOrCreateASRManager();
        if (this.asrModelPreloaded && this.asrManager.isInitialized) {
          this.asrManager.currentConversationId = conversationId;
          if (!this.asrManager.isRunning) {
            await this.asrManager.start(conversationId);
          }
          return true;
        }
        return await this.asrManager.initialize(conversationId);
      } catch (error) {
        console.error('Error initializing ASR:', error);
        throw error;
      }
    });

    // 处理音频数据
    ipcMain.on('asr-audio-data', async (event, data) => {
      try {
        if (!this.asrManager) {
          console.warn('[ASR] ASRManager not initialized, audio data ignored');
          return;
        }

        if (!this.asrManager.isInitialized) {
          console.warn('[ASR] ASRManager not initialized (isInitialized=false), audio data ignored');
          return;
        }

        if (!this.asrManager.isRunning) {
          console.warn('[ASR] ASRManager not running, audio data ignored');
          return;
        }

        const result = await this.asrManager.processAudioData(data);

        // 如果有识别结果，发送给所有窗口
        if (result) {
          this.emitASREvent('asr-sentence-complete', result);
        }
      } catch (error) {
        console.error('Error processing audio data:', error);

        // 发送错误消息
        this.emitASREvent('asr-error', {
          sourceId: data.sourceId,
          error: error.message
        });
      }
    });

    // 检查 ASR 模型是否就绪
    ipcMain.handle('asr-check-ready', async () => {
      return await this.checkASRReady();
    });

    // 开始 ASR
    ipcMain.handle('asr-start', async (event, conversationId) => {
      try {
        console.log(`[ASR] Starting ASR with conversationId: ${conversationId}`);
        this.asrManager = this.getOrCreateASRManager();
        await this.asrManager.start(conversationId);
        console.log('[ASR] ASR started successfully');
        return { success: true };
      } catch (error) {
        console.error('[ASR] Error starting ASR:', error);
        throw error;
      }
    });

    // 停止 ASR
    ipcMain.handle('asr-stop', async () => {
      try {
        if (this.asrManager) {
          await this.asrManager.stop();
        }
        return { success: true };
      } catch (error) {
        console.error('Error stopping ASR:', error);
        throw error;
      }
    });

    // 获取 ASR 配置
    ipcMain.handle('asr-get-configs', () => {
      try {
        return this.db.getASRConfigs();
      } catch (error) {
        console.error('Error getting ASR configs:', error);
        return [];
      }
    });

    // 创建 ASR 配置
    ipcMain.handle('asr-create-config', (event, configData) => {
      try {
        return this.db.createASRConfig(configData);
      } catch (error) {
        console.error('Error creating ASR config:', error);
        throw error;
      }
    });

    // 更新 ASR 配置
    ipcMain.handle('asr-update-config', (event, id, updates) => {
      try {
        return this.db.updateASRConfig(id, updates);
      } catch (error) {
        console.error('Error updating ASR config:', error);
        throw error;
      }
    });

    // 重新加载 ASR 模型
    ipcMain.handle('asr-reload-model', async () => {
      try {
        await this.reloadASRModel();
        return { success: true };
      } catch (error) {
        console.error('[ASR] Error reloading ASR model:', error);
        throw error;
      }
    });

    // 设置默认 ASR 配置
    ipcMain.handle('asr-set-default-config', (event, id) => {
      try {
        return this.db.setDefaultASRConfig(id);
      } catch (error) {
        console.error('Error setting default ASR config:', error);
        throw error;
      }
    });

    // 获取音频源配置
    ipcMain.handle('asr-get-audio-sources', () => {
      try {
        return this.db.getAudioSources();
      } catch (error) {
        console.error('Error getting audio sources:', error);
        return [];
      }
    });

    // 创建音频源配置
    ipcMain.handle('asr-create-audio-source', (event, sourceData) => {
      try {
        return this.db.createAudioSource(sourceData);
      } catch (error) {
        console.error('Error creating audio source:', error);
        throw error;
      }
    });

    // 更新音频源配置
    ipcMain.handle('asr-update-audio-source', (event, id, updates) => {
      try {
        return this.db.updateAudioSource(id, updates);
      } catch (error) {
        console.error('Error updating audio source:', error);
        throw error;
      }
    });

    // 获取对话的语音识别记录
    ipcMain.handle('asr-get-speech-records', (event, conversationId) => {
      try {
        return this.db.getSpeechRecordsByConversation(conversationId);
      } catch (error) {
        console.error('Error getting speech records:', error);
        return [];
      }
    });

    // 将语音识别记录转换为消息
    ipcMain.handle('asr-convert-to-message', async (event, recordId, conversationId) => {
      try {
        this.asrManager = this.getOrCreateASRManager();
        return await this.asrManager.convertRecordToMessage(recordId, conversationId);
      } catch (error) {
        console.error('Error converting record to message:', error);
        throw error;
      }
    });

    // 清理过期的音频文件
    ipcMain.handle('asr-cleanup-audio-files', async (event, retentionDays) => {
      try {
        this.asrManager = this.getOrCreateASRManager();
        return this.asrManager.cleanupExpiredAudioFiles(retentionDays);
      } catch (error) {
        console.error('Error cleaning up audio files:', error);
        throw error;
      }
    });

    console.log('ASR Audio IPC handlers registered');
  }

  /**
   * 设置媒体权限相关 IPC 处理器
   */
  setupMediaHandlers() {
    // 媒体权限 API (macOS) - 直接使用已导入的模块

    // 检查媒体访问权限状态
    ipcMain.handle('check-media-access-status', async (event, mediaType) => {
      try {
        if (process.platform === 'darwin') {
          const status = systemPreferences.getMediaAccessStatus(mediaType);
          console.log(`[Permission] ${mediaType} access status: ${status}`);
          return { status, platform: 'darwin' };
        }
        return { status: 'granted', platform: process.platform };
      } catch (error) {
        console.error(`Error checking ${mediaType} access status:`, error);
        return { status: 'unknown', error: error.message };
      }
    });

    // 请求媒体访问权限 (macOS)
    ipcMain.handle('request-media-access', async (event, mediaType) => {
      try {
        if (process.platform === 'darwin') {
          const currentStatus = systemPreferences.getMediaAccessStatus(mediaType);
          console.log(`[Permission] Current ${mediaType} status: ${currentStatus}`);

          if (currentStatus === 'granted') {
            return { granted: true, status: 'granted' };
          }

          if (currentStatus === 'denied') {
            return {
              granted: false,
              status: 'denied',
              message: '权限已被拒绝，请在系统偏好设置 > 安全性与隐私 > 隐私 中手动开启'
            };
          }

          console.log(`[Permission] Requesting ${mediaType} access...`);
          const granted = await systemPreferences.askForMediaAccess(mediaType);
          console.log(`[Permission] ${mediaType} access ${granted ? 'granted' : 'denied'}`);
          return { granted, status: granted ? 'granted' : 'denied' };
        }

        return { granted: true, status: 'granted', platform: process.platform };
      } catch (error) {
        console.error(`Error requesting ${mediaType} access:`, error);
        return { granted: false, error: error.message };
      }
    });

    // 检查屏幕录制权限 (macOS)
    ipcMain.handle('check-screen-capture-access', async () => {
      try {
        if (process.platform === 'darwin') {
          const status = systemPreferences.getMediaAccessStatus('screen');
          console.log(`[Permission] Screen capture access status: ${status}`);
          return { status, platform: 'darwin' };
        }
        return { status: 'granted', platform: process.platform };
      } catch (error) {
        console.error('Error checking screen capture access:', error);
        return { status: 'unknown', error: error.message };
      }
    });

    console.log('Media Permission IPC handlers registered');
  }

  /**
   * 获取或创建 ASR 管理器
   */
  getOrCreateASRManager() {
    if (!this.asrManager) {
      this.asrManager = new ASRManager();
      this.asrManager.setEventEmitter(this.emitASREvent);

      // 设置服务器崩溃回调
      this.asrManager.setServerCrashCallback((exitCode) => {
        console.error(`[ASR] 服务器崩溃 (code: ${exitCode})，重置预加载状态`);
        this.asrModelPreloaded = false;
        this.asrModelPreloading = false;

        if (this.asrServerCrashCallback) {
          this.asrServerCrashCallback(exitCode);
        }
      });
    }
    return this.asrManager;
  }

  /**
   * 检查 ASR 模型是否就绪
   */
  async checkASRReady() {
    if (this.asrModelPreloading) {
      return {
        ready: false,
        message: 'ASR模型正在预加载中...',
        preloading: true
      };
    }

    if (this.asrModelPreloaded && this.asrManager && this.asrManager.isInitialized) {
      return {
        ready: true,
        message: 'ASR模型已就绪',
        preloaded: true
      };
    }

    if (this.asrManager && !this.asrManager.isInitialized) {
      return {
        ready: false,
        message: 'ASR模型正在初始化...',
        initializing: true
      };
    }

    if (!this.asrManager) {
      return {
        ready: false,
        message: 'ASR模型未加载，请稍候...',
        notStarted: true
      };
    }

    return {
      ready: false,
      message: 'ASR模型状态未知'
    };
  }

  /**
   * 重新加载 ASR 模型
   */
  async reloadASRModel() {
    console.log('[ASR] 重新加载 ASR 模型');
    if (this.asrManager) {
      try {
        await this.asrManager.stop();
      } catch (error) {
        console.warn('[ASR] 停止现有 ASR 任务失败:', error);
      }
      try {
        this.asrManager.destroy();
      } catch (error) {
        console.warn('[ASR] 销毁 ASR 管理器失败:', error);
      }
      this.asrManager = null;
    }

    this.asrModelPreloaded = false;
    this.asrModelPreloading = false;
  }

  /**
   * 获取 ASR 预加载状态
   */
  getASRPreloadState() {
    return {
      preloading: this.asrModelPreloading,
      preloaded: this.asrModelPreloaded
    };
  }

  /**
   * 设置 ASR 预加载状态
   */
  setASRPreloadState(preloading, preloaded) {
    this.asrModelPreloading = preloading;
    this.asrModelPreloaded = preloaded;
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.asrManager) {
      try {
        this.asrManager.destroy();
      } catch (error) {
        console.error('Error destroying ASR manager:', error);
      }
    }
  }
}