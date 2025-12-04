import { ipcMain } from 'electron';

/**
 * 注册 ASR 音频处理相关 IPC 处理器
 * @param {object} deps
 * @param {Function} deps.getOrCreateASRManager
 * @param {Function} deps.emitASREvent
 * @param {Function} deps.checkASRReady
 * @param {Function} deps.reloadASRModel
 * @param {object} deps.db
 * @param {Function} deps.getASRPreloadState
 * @param {Function} deps.setASRPreloadState
 */
export function registerASRAudioHandlers({
  getOrCreateASRManager,
  emitASREvent,
  checkASRReady,
  reloadASRModel,
  db,
  getASRPreloadState,
  setASRPreloadState
}) {
  ipcMain.handle('asr-initialize', async (event, conversationId) => {
    try {
      const asrManager = getOrCreateASRManager();
      const { preloaded } = getASRPreloadState();
      if (preloaded && asrManager.isInitialized) {
        asrManager.currentConversationId = conversationId;
        if (!asrManager.isRunning) {
          await asrManager.start(conversationId);
        }
        return true;
      }
      return await asrManager.initialize(conversationId);
    } catch (error) {
      console.error('Error initializing ASR:', error);
      throw error;
    }
  });

  ipcMain.on('asr-audio-data', async (event, data) => {
    try {
      const asrManager = getOrCreateASRManager();

      if (!asrManager.isInitialized) {
        console.warn('[ASR] ASRManager not initialized (isInitialized=false), audio data ignored');
        return;
      }

      if (!asrManager.isRunning) {
        console.warn('[ASR] ASRManager not running, audio data ignored');
        return;
      }

      const result = await asrManager.processAudioData(data);
      if (result) {
        emitASREvent('asr-sentence-complete', result);
      }
    } catch (error) {
      console.error('Error processing audio data:', error);
      emitASREvent('asr-error', {
        sourceId: data.sourceId,
        error: error.message
      });
    }
  });

  ipcMain.handle('asr-check-ready', async () => {
    return await checkASRReady();
  });

  ipcMain.handle('asr-start', async (event, conversationId) => {
    try {
      console.log(`[ASR] Starting ASR with conversationId: ${conversationId}`);
      const asrManager = getOrCreateASRManager();
      await asrManager.start(conversationId);
      console.log('[ASR] ASR started successfully');
      return { success: true };
    } catch (error) {
      console.error('[ASR] Error starting ASR:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-stop', async () => {
    try {
      const asrManager = getOrCreateASRManager();
      await asrManager.stop();
      return { success: true };
    } catch (error) {
      console.error('Error stopping ASR:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-get-configs', () => {
    try {
      return db.getASRConfigs();
    } catch (error) {
      console.error('Error getting ASR configs:', error);
      return [];
    }
  });

  ipcMain.handle('asr-create-config', (event, configData) => {
    try {
      return db.createASRConfig(configData);
    } catch (error) {
      console.error('Error creating ASR config:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-update-config', (event, id, updates) => {
    try {
      return db.updateASRConfig(id, updates);
    } catch (error) {
      console.error('Error updating ASR config:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-reload-model', async () => {
    try {
      await reloadASRModel();
      return { success: true };
    } catch (error) {
      console.error('[ASR] Error reloading ASR model:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-set-default-config', (event, id) => {
    try {
      return db.setDefaultASRConfig(id);
    } catch (error) {
      console.error('Error setting default ASR config:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-get-audio-sources', () => {
    try {
      return db.getAudioSources();
    } catch (error) {
      console.error('Error getting audio sources:', error);
      return [];
    }
  });

  ipcMain.handle('asr-create-audio-source', (event, sourceData) => {
    try {
      return db.createAudioSource(sourceData);
    } catch (error) {
      console.error('Error creating audio source:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-update-audio-source', (event, id, updates) => {
    try {
      return db.updateAudioSource(id, updates);
    } catch (error) {
      console.error('Error updating audio source:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-get-speech-records', (event, conversationId) => {
    try {
      return db.getSpeechRecordsByConversation(conversationId);
    } catch (error) {
      console.error('Error getting speech records:', error);
      return [];
    }
  });

  ipcMain.handle('asr-convert-to-message', async (event, recordId, conversationId) => {
    try {
      const asrManager = getOrCreateASRManager();
      return await asrManager.convertRecordToMessage(recordId, conversationId);
    } catch (error) {
      console.error('Error converting record to message:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-cleanup-audio-files', async (event, retentionDays) => {
    try {
      const asrManager = getOrCreateASRManager();
      return asrManager.cleanupExpiredAudioFiles(retentionDays);
    } catch (error) {
      console.error('Error cleaning up audio files:', error);
      throw error;
    }
  });

  console.log('ASR Audio IPC handlers registered');
}

