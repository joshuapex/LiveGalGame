import { ipcMain, systemPreferences } from 'electron';

/**
 * 注册媒体权限相关 IPC 处理器
 */
export function registerMediaHandlers() {
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

