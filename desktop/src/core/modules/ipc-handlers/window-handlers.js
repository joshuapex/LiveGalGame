import { ipcMain } from 'electron';
import electron from 'electron';

/**
 * 注册窗口相关 IPC 处理器
 * @param {object} deps
 * @param {object} deps.windowManager
 * @param {Function} deps.checkASRReady
 */
export function registerWindowHandlers({ windowManager, checkASRReady }) {
  // 显示 HUD
  ipcMain.on('show-hud', async () => {
    // 如果正在创建，弹一次提示，避免用户频繁点击
    if (windowManager.hudCreating) {
      if (!windowManager.hudCreateNotified) {
        windowManager.hudCreateNotified = true;
        const parent = windowManager.getMainWindow();
        const message = 'ASR 模型正在加载，可能需要十几秒，请稍等片刻，无需重复点击。';
        ipcMain.emit('log', message);
        const dialogOpts = {
          type: 'info',
          buttons: ['好的'],
          title: '正在加载',
          message
        };
        if (parent) {
          parent.webContents.send('hud-loading', { message });
        }
        electron.dialog.showMessageBox(parent || null, dialogOpts).catch(() => {});
      }
      return;
    }

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

  // 对话建议配置更新后通知 HUD 重新加载配置
  ipcMain.on('suggestion-config-updated', () => {
    const hudWin = windowManager.getHUDWindow?.();
    if (hudWin && !hudWin.isDestroyed()) {
      hudWin.webContents.send('suggestion-config-updated');
    }
  });

  console.log('Window IPC handlers registered');
}
