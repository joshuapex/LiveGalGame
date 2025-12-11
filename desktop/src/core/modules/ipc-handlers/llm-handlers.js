import { ipcMain } from 'electron';

/**
 * 注册 LLM 配置相关 IPC 处理器
 * @param {object} deps
 * @param {object} deps.db
 */
export function registerLLMHandlers({ db }) {
  ipcMain.handle('llm-save-config', (event, configData) => {
    try {
      return db.saveLLMConfig(configData);
    } catch (error) {
      console.error('Error saving LLM config:', error);
      throw error;
    }
  });

  ipcMain.handle('llm-get-all-configs', () => {
    try {
      return db.getAllLLMConfigs();
    } catch (error) {
      console.error('Error getting LLM configs:', error);
      return [];
    }
  });

  ipcMain.handle('llm-get-default-config', () => {
    try {
      return db.getDefaultLLMConfig();
    } catch (error) {
      console.error('Error getting default LLM config:', error);
      return null;
    }
  });

  ipcMain.handle('llm-get-config-by-id', (event, id) => {
    try {
      return db.getLLMConfigById(id);
    } catch (error) {
      console.error('Error getting LLM config:', error);
      return null;
    }
  });

  ipcMain.handle('llm-delete-config', (event, id) => {
    try {
      return db.deleteLLMConfig(id);
    } catch (error) {
      console.error('Error deleting LLM config:', error);
      throw error;
    }
  });

  ipcMain.handle('llm-test-connection', async (event, configData) => {
    try {
      return await db.testLLMConnection(configData);
    } catch (error) {
      console.error('Error testing LLM connection:', error);
      return { success: false, message: error.message || '连接测试失败' };
    }
  });

  ipcMain.handle('llm-set-default-config', (event, id) => {
    try {
      return db.setDefaultLLMConfig(id);
    } catch (error) {
      console.error('Error setting default LLM config:', error);
      throw error;
    }
  });

  ipcMain.handle('llm-get-feature-configs', () => {
    try {
      return db.getAllLLMFeatureConfigs();
    } catch (error) {
      console.error('Error getting LLM feature configs:', error);
      return {};
    }
  });

  ipcMain.handle('llm-get-feature-config', (event, feature) => {
    try {
      return db.getLLMFeatureConfig(feature);
    } catch (error) {
      console.error('Error getting LLM feature config:', error);
      return null;
    }
  });

  ipcMain.handle('llm-set-feature-config', (event, payload = {}) => {
    try {
      const { feature, llm_config_id } = payload;
      return db.setLLMFeatureConfig(feature, llm_config_id || null);
    } catch (error) {
      console.error('Error setting LLM feature config:', error);
      throw error;
    }
  });

  console.log('LLM IPC handlers registered');
}

