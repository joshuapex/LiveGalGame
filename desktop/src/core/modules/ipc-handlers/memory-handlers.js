import { ipcMain } from 'electron';

/**
 * 注册 Memory Service 相关 IPC 处理器
 * 仅依赖结构化过滤，无向量召回。
 */
export function registerMemoryHandlers({ memoryService }) {
  if (!memoryService) {
    console.warn('[MemoryHandlers] memoryService not provided, skip registration');
    return;
  }

  ipcMain.handle('memory-query-profiles', async (event, payload = {}) => {
    try {
      return await memoryService.queryProfiles(payload);
    } catch (error) {
      console.error('[MemoryHandlers] query-profiles failed', error);
      throw error;
    }
  });

  ipcMain.handle('memory-query-events', async (event, payload = {}) => {
    try {
      return await memoryService.queryEvents(payload);
    } catch (error) {
      console.error('[MemoryHandlers] query-events failed', error);
      throw error;
    }
  });

  ipcMain.handle('memory-upsert-profile', async (event, payload = {}) => {
    try {
      return await memoryService.upsertProfile(payload);
    } catch (error) {
      console.error('[MemoryHandlers] upsert-profile failed', error);
      throw error;
    }
  });

  ipcMain.handle('memory-upsert-event', async (event, payload = {}) => {
    try {
      return await memoryService.upsertEvent(payload);
    } catch (error) {
      console.error('[MemoryHandlers] upsert-event failed', error);
      throw error;
    }
  });

  console.log('[MemoryHandlers] Memory handlers registered');
}
