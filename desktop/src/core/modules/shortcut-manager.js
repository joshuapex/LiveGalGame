import electron from 'electron';

const { globalShortcut } = electron;

/**
 * 快捷键管理器 - 负责注册和管理全局快捷键
 */
export class ShortcutManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.registeredShortcuts = new Set();
  }

  /**
   * 注册所有全局快捷键
   */
  registerAll() {
    this.registerWindowShortcuts();
    console.log('全局快捷键已注册');
  }

  /**
   * 注册窗口相关快捷键
   */
  registerWindowShortcuts() {
    // Ctrl+R 刷新
    this.register('CommandOrControl+R', () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        mainWindow.reload();
        console.log('窗口已刷新');
      }
    });

    // Ctrl+Shift+I 打开开发者工具
    this.register('CommandOrControl+Shift+I', () => {
      const mainWindow = this.windowManager.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
        console.log('开发者工具已切换');
      }
    });

    // ESC 键最小化HUD（后续实现）
    this.register('Escape', () => {
      console.log('ESC pressed - will minimize HUD later');
    });
  }

  /**
   * 注册单个快捷键
   * @param {string} accelerator - 快捷键组合
   * @param {Function} callback - 回调函数
   */
  register(accelerator, callback) {
    try {
      const success = globalShortcut.register(accelerator, callback);
      if (success) {
        this.registeredShortcuts.add(accelerator);
      } else {
        console.warn(`Failed to register shortcut: ${accelerator}`);
      }
    } catch (error) {
      console.error(`Error registering shortcut ${accelerator}:`, error);
    }
  }

  /**
   * 注销指定快捷键
   * @param {string} accelerator - 快捷键组合
   */
  unregister(accelerator) {
    globalShortcut.unregister(accelerator);
    this.registeredShortcuts.delete(accelerator);
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll() {
    globalShortcut.unregisterAll();
    this.registeredShortcuts.clear();
    console.log('全局快捷键已注销');
  }

  /**
   * 检查快捷键是否已注册
   * @param {string} accelerator - 快捷键组合
   * @returns {boolean}
   */
  isRegistered(accelerator) {
    return this.registeredShortcuts.has(accelerator);
  }

  /**
   * 获取所有已注册的快捷键
   * @returns {Set<string>}
   */
  getRegisteredShortcuts() {
    return new Set(this.registeredShortcuts);
  }
}