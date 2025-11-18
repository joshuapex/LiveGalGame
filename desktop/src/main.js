import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseManager from './db/database.js';
import ASRManager from './asr/asr-manager.js';

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 主窗口实例
let mainWindow;
let hudWindow;
let db;

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      // 禁用开发者工具快捷键（可选，如果需要可以注释掉）
      // devTools: false
    },
    titleBarStyle: 'hidden', // macOS 隐藏标题栏
    show: false, // 先不显示，准备好后再显示
    title: 'LiveGalGame Desktop',
    // 无边框窗口，看起来更像客户端应用
    frame: false,
    // 确保窗口看起来像原生应用
    backgroundColor: '#f8f6f7', // 浅色背景色，避免加载时闪烁
    // 禁用菜单栏（可选）
    autoHideMenuBar: true
  });

  // 加载React应用
  if (process.env.NODE_ENV === 'development') {
    // 开发环境：加载Vite开发服务器
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // 生产环境：加载构建后的文件
    mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  }

  // 窗口准备就绪后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 开发环境不自动打开开发者工具，保持客户端外观
    // 如需调试，可以使用快捷键 Cmd+Shift+I (Mac) 或 Ctrl+Shift+I (Windows/Linux)
    // if (process.env.NODE_ENV === 'development') {
    //   mainWindow.webContents.openDevTools();
    // }
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
    // 主窗口关闭时，也关闭HUD
    if (hudWindow) {
      hudWindow.close();
    }
  });

  // 监听来自渲染进程的IPC消息
  setupIPC();
}

// 设置IPC通信
function setupIPC() {
  // 显示HUD
  ipcMain.on('show-hud', () => {
    if (!hudWindow) {
      createHUDWindow();
    } else {
      hudWindow.show();
    }
    console.log('HUD显示');
  });

  // 隐藏HUD
  ipcMain.on('hide-hud', () => {
    if (hudWindow) {
      hudWindow.hide();
      console.log('HUD隐藏');
    }
  });

  // 关闭HUD
  ipcMain.on('close-hud', () => {
    if (hudWindow) {
      hudWindow.close();
      hudWindow = null;
      console.log('HUD关闭');
    }
  });

  // HUD拖拽相关变量
  let dragStartPos = { x: 0, y: 0 };
  let dragWindowBounds = { x: 0, y: 0, width: 0, height: 0 };
  let isHUDDragging = false;

  // 开始拖拽HUD
  ipcMain.on('start-hud-drag', (event, pos) => {
    if (!hudWindow) return;
    isHUDDragging = true;
    dragStartPos = pos;
    // 获取窗口的完整边界信息（位置和大小）
    const bounds = hudWindow.getBounds();
    dragWindowBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    console.log('HUD拖拽开始，窗口边界:', dragWindowBounds);
  });

  // 更新HUD拖拽位置
  // 重要：使用setBounds同时设置位置和大小，避免高DPI缩放时窗口无限放大
  // 参考：https://zhuanlan.zhihu.com/p/112564936
  ipcMain.on('update-hud-drag', (event, pos) => {
    if (!hudWindow || !isHUDDragging) return;
    const deltaX = pos.x - dragStartPos.x;
    const deltaY = pos.y - dragStartPos.y;
    const newX = dragWindowBounds.x + deltaX;
    const newY = dragWindowBounds.y + deltaY;
    // 必须使用setBounds同时设置位置和大小，不能只用setPosition
    hudWindow.setBounds({
      x: newX,
      y: newY,
      width: dragWindowBounds.width,
      height: dragWindowBounds.height
    });
  });

  // 结束HUD拖拽
  ipcMain.on('end-hud-drag', () => {
    isHUDDragging = false;
    console.log('HUD拖拽结束');
  });

  // 主窗口控制
  ipcMain.on('minimize-window', () => {
    if (mainWindow) {
      mainWindow.minimize();
      console.log('主窗口最小化');
    }
  });

  ipcMain.on('close-window', () => {
    if (mainWindow) {
      mainWindow.close();
      console.log('主窗口关闭');
    }
  });

  // 主窗口拖拽相关变量
  let mainDragStartPos = { x: 0, y: 0 };
  let mainDragWindowBounds = { x: 0, y: 0, width: 0, height: 0 };
  let isMainDragging = false;

  // 开始拖拽主窗口
  ipcMain.on('start-drag', (event, pos) => {
    if (!mainWindow) return;
    isMainDragging = true;
    mainDragStartPos = pos;
    // 获取窗口的完整边界信息
    const bounds = mainWindow.getBounds();
    mainDragWindowBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    console.log('主窗口拖拽开始，窗口边界:', mainDragWindowBounds);
  });

  // 更新主窗口拖拽位置
  ipcMain.on('update-drag', (event, pos) => {
    if (!mainWindow || !isMainDragging) return;
    const deltaX = pos.x - mainDragStartPos.x;
    const deltaY = pos.y - mainDragStartPos.y;
    const newX = mainDragWindowBounds.x + deltaX;
    const newY = mainDragWindowBounds.y + deltaY;
    // 使用setBounds同时设置位置和大小
    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: mainDragWindowBounds.width,
      height: mainDragWindowBounds.height
    });
  });

  // 结束主窗口拖拽
  ipcMain.on('end-drag', () => {
    isMainDragging = false;
    console.log('主窗口拖拽结束');
  });

  console.log('IPC通信已设置');

  // 数据库IPC处理器
  if (!db) {
    db = new DatabaseManager();
    // 不再自动初始化示例数据，数据需要手动在数据库中准备
  }

  // 获取所有角色
  ipcMain.handle('db-get-all-characters', () => {
    try {
      return db.getAllCharacters();
    } catch (error) {
      console.error('Error getting all characters:', error);
      return [];
    }
  });

  // 获取单个角色
  ipcMain.handle('db-get-character-by-id', (event, id) => {
    try {
      return db.getCharacterById(id);
    } catch (error) {
      console.error('Error getting character:', error);
      return null;
    }
  });

  // 创建角色
  ipcMain.handle('db-create-character', (event, characterData) => {
    try {
      return db.createCharacter(characterData);
    } catch (error) {
      console.error('Error creating character:', error);
      return null;
    }
  });

  // 创建对话
  ipcMain.handle('db-create-conversation', (event, conversationData) => {
    try {
      return db.createConversation(conversationData);
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  });

  // 获取角色的对话
  ipcMain.handle('db-get-conversations-by-character', (event, characterId) => {
    try {
      return db.getConversationsByCharacter(characterId);
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  });

  // 创建消息
  ipcMain.handle('db-create-message', (event, messageData) => {
    try {
      return db.createMessage(messageData);
    } catch (error) {
      console.error('Error creating message:', error);
      return null;
    }
  });

  // 获取对话的消息
  ipcMain.handle('db-get-messages-by-conversation', (event, conversationId) => {
    try {
      return db.getMessagesByConversation(conversationId);
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  });

  // 更新对话
  ipcMain.handle('db-update-conversation', (event, conversationId, updates) => {
    try {
      return db.updateConversation(conversationId, updates);
    } catch (error) {
      console.error('Error updating conversation:', error);
      return null;
    }
  });

  // 获取统计数据
  ipcMain.handle('db-get-statistics', () => {
    try {
      return db.getStatistics();
    } catch (error) {
      // 避免 EPIPE 错误，使用安全的错误处理
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
      return db.getCharacterPageStatistics();
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
      return db.getRecentConversations(limit || 10);
    } catch (error) {
      console.error('Error getting recent conversations:', error);
      return [];
    }
  });

  // 获取所有对话
  ipcMain.handle('db-get-all-conversations', () => {
    try {
      return db.getAllConversations();
    } catch (error) {
      console.error('Error getting all conversations:', error);
      return [];
    }
  });

  // 更新消息
  ipcMain.handle('db-update-message', (event, messageId, updates) => {
    try {
      return db.updateMessage(messageId, updates);
    } catch (error) {
      console.error('Error updating message:', error);
      return null;
    }
  });

  // 获取对话的AI分析数据
  ipcMain.handle('db-get-conversation-ai-data', (event, conversationId) => {
    try {
      return db.getConversationAIData(conversationId);
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
      return db.getCharacterDetails(characterId);
    } catch (error) {
      console.error('Error getting character details:', error);
      return null;
    }
  });

  // 更新角色详情的自定义字段
  ipcMain.handle('db-update-character-details-custom-fields', (event, characterId, customFields) => {
    try {
      return db.updateCharacterDetailsCustomFields(characterId, customFields);
    } catch (error) {
      console.error('Error updating character details custom fields:', error);
      return false;
    }
  });

  // 重新生成角色详情（从会话中）
  ipcMain.handle('db-regenerate-character-details', (event, characterId) => {
    try {
      return db.generateCharacterDetailsFromConversations(characterId);
    } catch (error) {
      console.error('Error regenerating character details:', error);
      return null;
    }
  });

  // 删除对话
  ipcMain.handle('db-delete-conversation', (event, conversationId) => {
    try {
      return db.deleteConversation(conversationId);
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  });

  // 删除角色
  ipcMain.handle('db-delete-character', (event, characterId) => {
    try {
      return db.deleteCharacter(characterId);
    } catch (error) {
      console.error('Error deleting character:', error);
      return false;
    }
  });

  // ========== LLM配置相关IPC处理器 ==========

  // 保存LLM配置
  ipcMain.handle('llm-save-config', (event, configData) => {
    try {
      return db.saveLLMConfig(configData);
    } catch (error) {
      console.error('Error saving LLM config:', error);
      throw error;
    }
  });

  // 获取所有LLM配置
  ipcMain.handle('llm-get-all-configs', () => {
    try {
      return db.getAllLLMConfigs();
    } catch (error) {
      console.error('Error getting LLM configs:', error);
      return [];
    }
  });

  // 获取默认LLM配置
  ipcMain.handle('llm-get-default-config', () => {
    try {
      return db.getDefaultLLMConfig();
    } catch (error) {
      console.error('Error getting default LLM config:', error);
      return null;
    }
  });

  // 获取指定ID的LLM配置
  ipcMain.handle('llm-get-config-by-id', (event, id) => {
    try {
      return db.getLLMConfigById(id);
    } catch (error) {
      console.error('Error getting LLM config:', error);
      return null;
    }
  });

  // 删除LLM配置
  ipcMain.handle('llm-delete-config', (event, id) => {
    try {
      return db.deleteLLMConfig(id);
    } catch (error) {
      console.error('Error deleting LLM config:', error);
      throw error;
    }
  });

  // 测试LLM连接
  ipcMain.handle('llm-test-connection', async (event, configData) => {
    try {
      return await db.testLLMConnection(configData);
    } catch (error) {
      console.error('Error testing LLM connection:', error);
      return { success: false, message: error.message || '连接测试失败' };
    }
  });

  // 设置默认LLM配置
  ipcMain.handle('llm-set-default-config', (event, id) => {
    try {
      return db.setDefaultLLMConfig(id);
    } catch (error) {
      console.error('Error setting default LLM config:', error);
      throw error;
    }
  });

  console.log('Database IPC handlers registered');

  // ========== ASR（语音识别）IPC处理器 ==========

  // ASR 管理器实例（延迟加载）
  let asrManager = null;

  // 初始化 ASR 管理器
  ipcMain.handle('asr-initialize', async (event, conversationId) => {
    try {
      if (!asrManager) {
        asrManager = new ASRManager();
      }
      return await asrManager.initialize(conversationId);
    } catch (error) {
      console.error('Error initializing ASR:', error);
      throw error;
    }
  });

  // 处理音频数据
  ipcMain.on('asr-audio-data', async (event, data) => {
    try {
      if (!asrManager) {
        console.warn('ASRManager not initialized');
        return;
      }

      const result = await asrManager.processAudioData(data);

      // 如果有识别结果，发送给所有窗口
      if (result) {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(window => {
          window.webContents.send('asr-sentence-complete', result);
        });
      }
    } catch (error) {
      console.error('Error processing audio data:', error);

      // 发送错误消息
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        window.webContents.send('asr-error', {
          sourceId: data.sourceId,
          error: error.message
        });
      });
    }
  });

  // 开始 ASR
  ipcMain.handle('asr-start', async (event, conversationId) => {
    try {
      if (!asrManager) {
        asrManager = new ASRManager();
      }
      await asrManager.start(conversationId);
      return { success: true };
    } catch (error) {
      console.error('Error starting ASR:', error);
      throw error;
    }
  });

  // 停止 ASR
  ipcMain.handle('asr-stop', async () => {
    try {
      if (asrManager) {
        await asrManager.stop();
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
      return db.getASRConfigs();
    } catch (error) {
      console.error('Error getting ASR configs:', error);
      return [];
    }
  });

  // 创建 ASR 配置
  ipcMain.handle('asr-create-config', (event, configData) => {
    try {
      return db.createASRConfig(configData);
    } catch (error) {
      console.error('Error creating ASR config:', error);
      throw error;
    }
  });

  // 更新 ASR 配置
  ipcMain.handle('asr-update-config', (event, id, updates) => {
    try {
      return db.updateASRConfig(id, updates);
    } catch (error) {
      console.error('Error updating ASR config:', error);
      throw error;
    }
  });

  // 设置默认 ASR 配置
  ipcMain.handle('asr-set-default-config', (event, id) => {
    try {
      return db.setDefaultASRConfig(id);
    } catch (error) {
      console.error('Error setting default ASR config:', error);
      throw error;
    }
  });

  // 获取音频源配置
  ipcMain.handle('asr-get-audio-sources', () => {
    try {
      return db.getAudioSources();
    } catch (error) {
      console.error('Error getting audio sources:', error);
      return [];
    }
  });

  // 创建音频源配置
  ipcMain.handle('asr-create-audio-source', (event, sourceData) => {
    try {
      return db.createAudioSource(sourceData);
    } catch (error) {
      console.error('Error creating audio source:', error);
      throw error;
    }
  });

  // 更新音频源配置
  ipcMain.handle('asr-update-audio-source', (event, id, updates) => {
    try {
      return db.updateAudioSource(id, updates);
    } catch (error) {
      console.error('Error updating audio source:', error);
      throw error;
    }
  });

  // 获取对话的语音识别记录
  ipcMain.handle('asr-get-speech-records', (event, conversationId) => {
    try {
      return db.getSpeechRecordsByConversation(conversationId);
    } catch (error) {
      console.error('Error getting speech records:', error);
      return [];
    }
  });

  // 将语音识别记录转换为消息
  ipcMain.handle('asr-convert-to-message', async (event, recordId, conversationId) => {
    try {
      if (!asrManager) {
        asrManager = new ASRManager();
      }
      return await asrManager.convertRecordToMessage(recordId, conversationId);
    } catch (error) {
      console.error('Error converting record to message:', error);
      throw error;
    }
  });

  // 清理过期的音频文件
  ipcMain.handle('asr-cleanup-audio-files', async (event, retentionDays) => {
    try {
      if (!asrManager) {
        asrManager = new ASRManager();
      }
      return asrManager.cleanupExpiredAudioFiles(retentionDays);
    } catch (error) {
      console.error('Error cleaning up audio files:', error);
      throw error;
    }
  });

  console.log('ASR IPC handlers registered');
}

// 创建HUD窗口
function createHUDWindow() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    console.log(`Creating HUD window at position: ${width - 540}, ${height - 620}`);

    hudWindow = new BrowserWindow({
      width: 520,
      height: 600,
      minWidth: 400,
      minHeight: 300,
      maxWidth: 1200,
      maxHeight: 1000,
      x: width - 540,
      y: height - 620,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,  // 允许调整大小
      show: false, // 先不显示，等ready后再显示
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js')
      },
      title: 'LiveGalGame HUD'
    });

    // 初始化数据库
    if (!db) {
      db = new DatabaseManager();
      // 不再自动初始化示例数据
    }

    // 自动授权媒体权限（麦克风）
    hudWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media') {
        return callback(true);
      }
      callback(false);
    });

    // 确保窗口可以调整大小（显式设置）
    hudWindow.setResizable(true);

    // 加载HUD页面 - 区分开发和生产环境
    if (process.env.NODE_ENV === 'development') {
      // 开发环境：从Vite服务器加载（使用不同端口或路由）
      hudWindow.loadURL('http://localhost:5173/hud.html');
    } else {
      // 生产环境：从构建后的文件加载
      hudWindow.loadFile(path.join(__dirname, '../dist/renderer/hud.html'));
    }

    // 页面加载完成后再显示
    hudWindow.once('ready-to-show', () => {
      console.log('HUD window ready to show');
      // 再次确认窗口可以调整大小
      hudWindow.setResizable(true);
      hudWindow.show();
    });

    // 页面加载错误处理
    hudWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('HUD failed to load:', errorCode, errorDescription);
    });

    // HUD关闭事件
    hudWindow.on('closed', () => {
      console.log('HUD window closed');
      hudWindow = null;
      // 通知主窗口HUD已关闭
      if (mainWindow) {
        mainWindow.webContents.send('hud-closed');
      }
    });

    console.log('HUD窗口创建成功');
  } catch (error) {
    console.error('Failed to create HUD window:', error);
  }
}

// 注册全局快捷键
function registerGlobalShortcuts() {
  // Ctrl+R 刷新
  globalShortcut.register('CommandOrControl+R', () => {
    if (mainWindow) {
      mainWindow.reload();
      console.log('窗口已刷新');
    }
  });

  // Ctrl+Shift+I 打开开发者工具
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
      console.log('开发者工具已切换');
    }
  });

  // ESC 键最小化HUD（后续实现）
  globalShortcut.register('Escape', () => {
    console.log('ESC pressed - will minimize HUD later');
  });

  console.log('全局快捷键已注册');
}

// 应用准备就绪
app.whenReady().then(() => {
  createWindow();
  // createHUDWindow(); // 暂时不自动创建HUD，等待用户触发
  registerGlobalShortcuts();

  // macOS上激活应用时创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 应用退出前清理
app.on('will-quit', () => {
  // 注销所有全局快捷键
  globalShortcut.unregisterAll();
  console.log('全局快捷键已注销');
});

// 所有窗口关闭时退出应用（除了macOS）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

console.log('LiveGalGame Desktop 启动成功！');
