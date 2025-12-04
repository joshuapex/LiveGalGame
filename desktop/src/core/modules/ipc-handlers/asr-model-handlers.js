import { ipcMain } from 'electron';

/**
 * 注册 ASR 模型管理相关 IPC 处理器
 * @param {object} deps
 * @param {object} deps.modelManager
 */
export function registerASRModelHandlers({ modelManager }) {
  ipcMain.handle('asr-get-model-presets', () => {
    try {
      return modelManager.getModelPresets();
    } catch (error) {
      console.error('Error getting ASR model presets:', error);
      return [];
    }
  });

  ipcMain.handle('asr-get-model-status', (event, modelId) => {
    try {
      return modelManager.getModelStatus(modelId);
    } catch (error) {
      console.error('Error getting ASR model status:', error);
      return null;
    }
  });

  ipcMain.handle('asr-get-all-model-statuses', () => {
    try {
      return modelManager.getAllModelStatuses();
    } catch (error) {
      console.error('Error getting ASR model statuses:', error);
      return [];
    }
  });

  ipcMain.handle('asr-download-model', (event, modelId, source) => {
    try {
      return modelManager.startDownload(modelId, source);
    } catch (error) {
      console.error('Error starting ASR model download:', error);
      throw error;
    }
  });

  ipcMain.handle('asr-cancel-model-download', (event, modelId) => {
    try {
      return modelManager.cancelDownload(modelId);
    } catch (error) {
      console.error('Error cancelling ASR model download:', error);
      throw error;
    }
  });

  console.log('ASR Model IPC handlers registered');
}

