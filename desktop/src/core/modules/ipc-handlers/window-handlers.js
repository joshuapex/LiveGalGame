import { ipcMain } from 'electron';

/**
 * 注册窗口相关 IPC 处理器
 * @param {object} deps
 * @param {object} deps.windowManager
 * @param {Function} deps.checkASRReady
 */
export function registerWindowHandlers({ windowManager, checkASRReady }) {
  // 显示 HUD
  ipcMain.on('show-hud', async () => {
    if (!windowManager.getHUDWindow()) {
      await windowManager.createHUDWindow(() => checkASRReady(), () => {});
    } else {
      windowManager.showHUD();
    }
    console.log('HUD显示');
  });

  // 隐藏 HUD
  ipcMain.on('hide-hud', () => {
    windowManager.hideHUD();
    console.log('HUD隐藏');
  });

  // 关闭 HUD
  ipcMain.on('close-hud', () => {
    windowManager.closeHUD();
    console.log('HUD关闭');
  });

  // HUD 拖拽
  ipcMain.on('start-hud-drag', (event, pos) => {
    windowManager.startHUDrag(pos);
  });

  ipcMain.on('update-hud-drag', (event, pos) => {
    windowManager.updateHUDrag(pos);
  });

  ipcMain.on('end-hud-drag', () => {
    windowManager.endHUDrag();
  });

  // 主窗口控制
  ipcMain.on('minimize-window', () => {
    windowManager.minimizeMainWindow();
  });

  ipcMain.on('close-window', () => {
    windowManager.closeMainWindow();
  });

  // 主窗口拖拽
  ipcMain.on('start-drag', (event, pos) => {
    windowManager.startMainDrag(pos);
  });

  ipcMain.on('update-drag', (event, pos) => {
    windowManager.updateMainDrag(pos);
  });

  ipcMain.on('end-drag', () => {
    windowManager.endMainDrag();
  });

  console.log('Window IPC handlers registered');
}

