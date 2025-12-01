import electron from 'electron';

const { systemPreferences } = electron;

/**
 * 权限管理器 - 负责处理 macOS 媒体权限请求
 */
export class PermissionManager {
  constructor() {}

  /**
   * 应用启动时请求权限
   */
  async requestStartupPermissions() {
    // macOS: 应用启动时请求麦克风权限
    if (process.platform === 'darwin') {
      try {
        const micStatus = systemPreferences.getMediaAccessStatus('microphone');
        console.log(`[Permission] Initial microphone status: ${micStatus}`);

        if (micStatus !== 'granted') {
          console.log('[Permission] Requesting microphone access on startup...');
          const granted = await systemPreferences.askForMediaAccess('microphone');
          console.log(`[Permission] Microphone access ${granted ? 'granted' : 'denied'}`);
        }

        // 检查屏幕录制权限状态（用于系统音频捕获）
        const screenStatus = systemPreferences.getMediaAccessStatus('screen');
        console.log(`[Permission] Screen capture status: ${screenStatus}`);
        if (screenStatus !== 'granted') {
          console.log('[Permission] 提示: 系统音频捕获需要屏幕录制权限，请在系统偏好设置中授权');
        }
      } catch (err) {
        console.error('[Permission] Error requesting permissions:', err);
      }
    }
  }

  /**
   * 检查媒体访问权限状态
   * @param {string} mediaType - 媒体类型 (microphone, camera, screen)
   * @returns {Promise<Object>}
   */
  async checkMediaAccessStatus(mediaType) {
    try {
      if (process.platform === 'darwin') {
        const status = systemPreferences.getMediaAccessStatus(mediaType);
        console.log(`[Permission] ${mediaType} access status: ${status}`);
        return { status, platform: 'darwin' };
      }
      // Windows/Linux 默认允许（需要用户在系统设置中授权）
      return { status: 'granted', platform: process.platform };
    } catch (error) {
      console.error(`Error checking ${mediaType} access status:`, error);
      return { status: 'unknown', error: error.message };
    }
  }

  /**
   * 请求媒体访问权限
   * @param {string} mediaType - 媒体类型 (microphone, camera, screen)
   * @returns {Promise<Object>}
   */
  async requestMediaAccess(mediaType) {
    try {
      if (process.platform === 'darwin') {
        // 先检查当前状态
        const currentStatus = systemPreferences.getMediaAccessStatus(mediaType);
        console.log(`[Permission] Current ${mediaType} status: ${currentStatus}`);

        if (currentStatus === 'granted') {
          return { granted: true, status: 'granted' };
        }

        if (currentStatus === 'denied') {
          // 如果已被拒绝，无法再次请求，用户需要手动在系统偏好设置中开启
          return {
            granted: false,
            status: 'denied',
            message: '权限已被拒绝，请在系统偏好设置 > 安全性与隐私 > 隐私 中手动开启'
          };
        }

        // 请求权限
        console.log(`[Permission] Requesting ${mediaType} access...`);
        const granted = await systemPreferences.askForMediaAccess(mediaType);
        console.log(`[Permission] ${mediaType} access ${granted ? 'granted' : 'denied'}`);
        return { granted, status: granted ? 'granted' : 'denied' };
      }

      // Windows/Linux 不需要显式请求
      return { granted: true, status: 'granted', platform: process.platform };
    } catch (error) {
      console.error(`Error requesting ${mediaType} access:`, error);
      return { granted: false, error: error.message };
    }
  }

  /**
   * 检查屏幕录制权限
   * @returns {Promise<Object>}
   */
  async checkScreenCaptureAccess() {
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
  }
}