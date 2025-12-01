import { app, BrowserWindow, desktopCapturer } from 'electron';
import { initMain as initAudioLoopback } from 'electron-audio-loopback';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 初始化 electron-audio-loopback（必须在 app.whenReady 之前调用）
initAudioLoopback();

// 导入模块管理器
import { WindowManager } from './core/modules/window-manager.js';
import { IPCManager } from './core/modules/ipc-handlers.js';
import { ShortcutManager } from './core/modules/shortcut-manager.js';
import { ASRPreloader } from './core/modules/asr-preloader.js';
import { PermissionManager } from './core/modules/permission-manager.js';

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 全局实例
let windowManager;
let ipcManager;
let shortcutManager;
let asrPreloader;
let permissionManager;

/**
 * 确保 ASR 缓存环境变量
 */
function ensureAsrCacheEnv() {
  try {
    const userData = app.getPath('userData');
    if (!process.env.HF_HOME) {
      process.env.HF_HOME = path.join(userData, 'hf-home');
    }
    fs.mkdirSync(process.env.HF_HOME, { recursive: true });
    if (!process.env.ASR_CACHE_DIR) {
      process.env.ASR_CACHE_DIR = path.join(process.env.HF_HOME, 'hub');
    }
    fs.mkdirSync(process.env.ASR_CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('[ASR] Failed to ensure cache directories:', error);
  }
}

/**
 * ASR事件发射器 - 向所有窗口发送ASR事件
 * @param {string} eventName - 事件名称
 * @param {any} data - 事件数据
 */
function emitASREvent(eventName, data) {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    window.webContents.send(eventName, data);
  });
}

/**
 * 初始化所有管理器
 */
function initializeManagers() {
  // 创建窗口管理器
  windowManager = new WindowManager();

  // 创建 IPC 管理器
  ipcManager = new IPCManager(windowManager);
  ipcManager.setASREventEmitter(emitASREvent);

  // 设置服务器崩溃回调
  ipcManager.setASRServerCrashCallback((exitCode) => {
    console.error(`[ASR] 服务器崩溃 (code: ${exitCode})`);

    // 通知所有窗口服务器崩溃
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('asr-server-crashed', { exitCode });
    });
  });

  // 创建快捷键管理器
  shortcutManager = new ShortcutManager(windowManager);

  // 创建 ASR 预加载器
  asrPreloader = new ASRPreloader(ipcManager);
  asrPreloader.setASREventEmitter(emitASREvent);
  asrPreloader.setServerCrashCallback((exitCode) => {
    console.error(`[ASR] 服务器崩溃 (code: ${exitCode})`);

    // 通知所有窗口服务器崩溃
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('asr-server-crashed', { exitCode });
    });
  });

  // 创建权限管理器
  permissionManager = new PermissionManager();
}

/**
 * 注册桌面捕获器
 */
function registerDesktopCapturer() {
  // Desktop Capturer API 已在文件顶部注册，此处不再重复注册
  console.log('Desktop Capturer IPC handler registered');
}

/**
 * 设置应用事件监听器
 */
function setupAppEventListeners() {
  // macOS上激活应用时创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow(() => ipcManager.checkASRReady());
    }
  });

  // 应用退出前清理
  app.on('will-quit', () => {
    cleanup();
  });

  // 所有窗口关闭时退出应用（除了macOS）
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

/**
 * 清理资源
 */
function cleanup() {
  console.log('Cleaning up resources...');

  // 注销所有全局快捷键
  if (shortcutManager) {
    shortcutManager.unregisterAll();
  }

  // 清理 ASR 预加载器
  if (asrPreloader) {
    asrPreloader.cleanup();
  }

  // 清理 IPC 管理器
  if (ipcManager) {
    ipcManager.cleanup();
  }

  console.log('Resource cleanup complete');
}

// ========== 主应用入口 ==========

app.whenReady().then(async () => {
  console.log('Starting LiveGalGame Desktop...');

  // 确保 ASR 缓存环境
  ensureAsrCacheEnv();

  // 初始化所有管理器
  initializeManagers();

  // 注册 IPC 处理器
  ipcManager.registerHandlers();

  // 注册桌面捕获器
  registerDesktopCapturer();

  // 创建主窗口
  windowManager.createMainWindow(() => ipcManager.checkASRReady());

  // 注册全局快捷键
  shortcutManager.registerAll();

  // 请求权限（macOS）
  await permissionManager.requestStartupPermissions();

  // 预加载ASR模型（后台进行，不阻塞UI）
  asrPreloader.preload(() => ipcManager.checkASRReady()).catch(err => {
    console.error('[ASR] 预加载失败，将在使用时加载:', err);
  });

  setupAppEventListeners();

  console.log('LiveGalGame Desktop 启动成功！');
});