import electron from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const { app, BrowserWindow, screen, dialog } = electron;

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 生产环境下获取打包后的渲染进程入口文件路径
 * 开发环境下不会使用（dev 走 loadURL）
 * @param {string} fileName
 */
function getRendererFilePath(fileName) {
  // app.getAppPath() 会指向 app.asar 根目录，dist/renderer 位于其下一级
  const appRoot = app.getAppPath();
  return path.join(appRoot, 'dist', 'renderer', fileName);
}

/**
 * 窗口管理器 - 负责创建和管理应用窗口
 */
export class WindowManager {
  constructor() {
    this.mainWindow = null;
    this.hudWindow = null;
    this.hudCreating = false;       // 防止重复创建 HUD
    this.hudCreateNotified = false; // 避免反复弹窗
    this.hudDragState = {
      isDragging: false,
      startPos: { x: 0, y: 0 },
      windowBounds: { x: 0, y: 0, width: 0, height: 0 }
    };
    this.mainDragState = {
      isDragging: false,
      startPos: { x: 0, y: 0 },
      windowBounds: { x: 0, y: 0, width: 0, height: 0 }
    };
  }

  /**
   * 创建主窗口
   * @param {Function} checkASRReady - ASR就绪检查函数
   */
  createMainWindow(checkASRReady) {
    // 创建浏览器窗口
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, '../../preload.js'),
        // 启用系统音频捕获（macOS 需要）
        enableWebAudio: true,
        // 禁用开发者工具快捷键（可选，如果需要可以注释掉）
        // devTools: false
      },
      titleBarStyle: 'hidden', // macOS 隐藏标题栏
      show: false, // 先不显示，准备好后再显示
      title: 'LiveGalGame Desktop',
      // 无边框窗口，看起来更像客户端应用
      frame: false,
      transparent: true,
      // 确保窗口看起来像原生应用
      // backgroundColor: '#f8f6f7', // 移除背景色以支持透明圆角
      // 禁用菜单栏（可选）
      autoHideMenuBar: true
    });

    // 启用系统音频捕获权限
    this.mainWindow.webContents.setAudioMuted(false);

    // 加载React应用
    if (process.env.NODE_ENV === 'development') {
      // 开发环境：加载Vite开发服务器
      this.mainWindow.loadURL('http://localhost:5173');
    } else {
      // 生产环境：加载构建后的文件
      this.mainWindow.loadFile(getRendererFilePath('index.html'));
    }

    // 主窗口加载错误/渲染日志（生产环境排查白屏很关键）
    this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('[MainWindow] did-fail-load:', { errorCode, errorDescription, validatedURL });
    });
    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[MainWindow] render-process-gone:', details);
    });
    this.mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const levelName = ['debug', 'info', 'warn', 'error'][level] || String(level);
      console.log(`[Renderer:${levelName}] ${message} (${sourceId}:${line})`);
    });

    // 窗口准备就绪后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      // 开发环境不自动打开开发者工具，保持客户端外观
      // 如需调试，可以使用快捷键 Cmd+Shift+I (Mac) 或 Ctrl+Shift+I (Windows/Linux)
      // if (process.env.NODE_ENV === 'development') {
      //   this.mainWindow.webContents.openDevTools();
      // }
    });

    // 窗口关闭事件
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      // 主窗口关闭时，也关闭HUD
      if (this.hudWindow) {
        this.hudWindow.close();
      }
    });
  }

  /**
   * 创建HUD窗口
   * @param {Function} checkASRReady - ASR就绪检查函数
   * @param {Function} onHudClosed - HUD关闭回调
   */
  async createHUDWindow(checkASRReady, onHudClosed) {
    if (this.hudCreating) {
      return;
    }
    this.hudCreating = true;
    this.hudCreateNotified = false;

    try {
      const parentWindow = this.getMainWindow();
      const notifyHudLoading = (payload) => {
        if (parentWindow) {
          parentWindow.webContents.send('hud-loading', payload);
        }
      };

      // 检查ASR模型是否就绪，如果未就绪则等待
      console.log('[HUD] 检查ASR模型状态...');
      let checkAttempts = 0;
      const maxAttempts = 1800; // 最多等待180秒（1800 * 100ms），覆盖首次模型下载场景

      while (checkAttempts < maxAttempts) {
        const status = await checkASRReady();
        const waitedSeconds = Number(((checkAttempts * 100) / 1000).toFixed(1));
        if (status.ready) {
          console.log('[HUD] ASR模型已就绪:', status.message);
          if (parentWindow) {
            parentWindow.webContents.send('hud-ready', {
              message: 'ASR模型已就绪，正在打开HUD...',
              waitedSeconds,
              from: 'hud'
            });
          }
          break;
        }

        if (checkAttempts === 0) {
          console.log('[HUD] ASR模型未就绪，等待加载:', status.message);
          notifyHudLoading({
            message: status.message || 'ASR模型正在加载，请稍候...',
            waitedSeconds,
            downloading: status.downloading,
            from: 'hud'
          });
        } else if (checkAttempts % 10 === 0) {
          // 每1秒输出一次状态
          const waitedMs = checkAttempts * 100;
          console.log(`[HUD] 等待ASR模型加载中... (${(waitedMs / 1000).toFixed(1)}s)`);
          notifyHudLoading({
            message: status.message || 'ASR模型正在加载，请稍候...',
            waitedSeconds,
            downloading: status.downloading,
            from: 'hud'
          });
        } else if (checkAttempts % 100 === 0) {
          // 每10秒输出一次详细提示
          const waitedSec = (checkAttempts * 100) / 1000;
          console.log(`[HUD] ASR仍在加载，可能正在下载模型，请稍候... 已等待 ${waitedSec.toFixed(0)}s`);
          notifyHudLoading({
            message: status.message || 'ASR模型正在加载，请稍候...',
            waitedSeconds,
            downloading: status.downloading,
            from: 'hud',
            detailed: true
          });
        }

        checkAttempts++;
        await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms
      }

      if (checkAttempts >= maxAttempts) {
        console.warn('[HUD] ASR模型加载超时，但继续创建HUD窗口');
        notifyHudLoading({
          message: '等待ASR模型加载超时，仍尝试打开HUD，请稍候',
          waitedSeconds: Number(((checkAttempts * 100) / 1000).toFixed(1)),
          from: 'hud',
          timedOut: true
        });
      } else {
        console.log(`[HUD] ASR模型就绪，等待时间: ${(checkAttempts * 100 / 1000).toFixed(1)}s`);
      }

      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.workAreaSize;

      console.log(`Creating HUD window at position: ${width - 540}, ${height - 620}`);

      this.hudWindow = new BrowserWindow({
        width: 600,
        height: 700,
        minWidth: 400,
        minHeight: 400,
        maxWidth: 1200,
        maxHeight: 1000,
        x: width - 620,
        y: height - 720,
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
          preload: path.join(__dirname, '../../preload.js')
        },
        title: 'LiveGalGame HUD'
      });

      // 为 HUD 窗口启用系统音频捕获权限
      this.hudWindow.webContents.setAudioMuted(false);

      // 自动授权媒体权限（麦克风）
      this.hudWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
          return callback(true);
        }
        callback(false);
      });

      // 确保窗口可以调整大小（显式设置）
      this.hudWindow.setResizable(true);

      // 加载HUD页面 - 区分开发和生产环境
      if (process.env.NODE_ENV === 'development') {
        // 开发环境：从Vite服务器加载（使用不同端口或路由）
        this.hudWindow.loadURL('http://localhost:5173/hud.html');
      } else {
        // 生产环境：从构建后的文件加载
        this.hudWindow.loadFile(getRendererFilePath('hud.html'));
      }

      // 页面加载完成后再显示
      this.hudWindow.once('ready-to-show', () => {
        console.log('HUD window ready to show');
        // 再次确认窗口可以调整大小
        this.hudWindow.setResizable(true);
        this.hudWindow.show();
      });

      // 页面加载错误处理
      this.hudWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('HUD failed to load:', errorCode, errorDescription);
      });

      // HUD关闭事件
      this.hudWindow.on('closed', () => {
        console.log('HUD window closed');
        this.hudWindow = null;
        // 通知主窗口HUD已关闭
        if (this.mainWindow) {
          this.mainWindow.webContents.send('hud-closed');
        }
        if (onHudClosed) onHudClosed();
      });

      console.log('HUD窗口创建成功');
    } catch (error) {
      console.error('Failed to create HUD window:', error);
    }
    this.hudCreating = false;
    this.hudCreateNotified = false;
  }

  /**
   * 显示HUD
   */
  showHUD() {
    if (!this.hudWindow) {
      return false;
    }
    this.hudWindow.show();
    return true;
  }

  /**
   * 隐藏HUD
   */
  hideHUD() {
    if (this.hudWindow) {
      this.hudWindow.hide();
    }
  }

  /**
   * 关闭HUD
   */
  closeHUD() {
    if (this.hudWindow) {
      this.hudWindow.close();
      this.hudWindow = null;
    }
  }

  /**
   * 开始HUD拖拽
   */
  startHUDrag(pos) {
    if (!this.hudWindow) return;
    this.hudDragState.isDragging = true;
    this.hudDragState.startPos = pos;
    const bounds = this.hudWindow.getBounds();
    this.hudDragState.windowBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    console.log('HUD拖拽开始，窗口边界:', this.hudDragState.windowBounds);
  }

  /**
   * 更新HUD拖拽位置
   */
  updateHUDrag(pos) {
    if (!this.hudWindow || !this.hudDragState.isDragging) return;
    const deltaX = pos.x - this.hudDragState.startPos.x;
    const deltaY = pos.y - this.hudDragState.startPos.y;
    const newX = this.hudDragState.windowBounds.x + deltaX;
    const newY = this.hudDragState.windowBounds.y + deltaY;
    this.hudWindow.setBounds({
      x: newX,
      y: newY,
      width: this.hudDragState.windowBounds.width,
      height: this.hudDragState.windowBounds.height
    });
  }

  /**
   * 结束HUD拖拽
   */
  endHUDrag() {
    this.hudDragState.isDragging = false;
    console.log('HUD拖拽结束');
  }

  /**
   * 开始主窗口拖拽
   */
  startMainDrag(pos) {
    if (!this.mainWindow) return;
    this.mainDragState.isDragging = true;
    this.mainDragState.startPos = pos;
    const bounds = this.mainWindow.getBounds();
    this.mainDragState.windowBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    console.log('主窗口拖拽开始，窗口边界:', this.mainDragState.windowBounds);
  }

  /**
   * 更新主窗口拖拽位置
   */
  updateMainDrag(pos) {
    if (!this.mainWindow || !this.mainDragState.isDragging) return;
    const deltaX = pos.x - this.mainDragState.startPos.x;
    const deltaY = pos.y - this.mainDragState.startPos.y;
    const newX = this.mainDragState.windowBounds.x + deltaX;
    const newY = this.mainDragState.windowBounds.y + deltaY;
    this.mainWindow.setBounds({
      x: newX,
      y: newY,
      width: this.mainDragState.windowBounds.width,
      height: this.mainDragState.windowBounds.height
    });
  }

  /**
   * 结束主窗口拖拽
   */
  endMainDrag() {
    this.mainDragState.isDragging = false;
    console.log('主窗口拖拽结束');
  }

  /**
   * 最小化主窗口
   */
  minimizeMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.minimize();
      console.log('主窗口最小化');
    }
  }

  /**
   * 关闭主窗口
   */
  closeMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.close();
      console.log('主窗口关闭');
    }
  }

  /**
   * 获取主窗口
   */
  getMainWindow() {
    return this.mainWindow;
  }

  /**
   * 获取HUD窗口
   */
  getHUDWindow() {
    return this.hudWindow;
  }
}
