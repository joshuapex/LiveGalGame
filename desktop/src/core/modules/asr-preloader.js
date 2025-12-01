

/**
 * ASR 预加载器 - 负责在应用启动时预加载 ASR 模型
 */
export class ASRPreloader {
  constructor(ipcManager) {
    this.ipcManager = ipcManager;
    // 不再维护独立的 asrManager 实例，而是使用 ipcManager 中的实例
  }

  /**
   * 设置事件发射器
   */
  setASREventEmitter(emitASREvent) {
    this.emitASREvent = emitASREvent;
  }

  /**
   * 设置服务器崩溃回调
   */
  setServerCrashCallback(callback) {
    this.serverCrashCallback = callback;
  }

  /**
   * 预加载 ASR 模型（应用启动时进行）
   * @param {Function} checkCallback - 检查回调函数
   */
  async preload(checkCallback) {
    const state = this.ipcManager.getASRPreloadState();

    if (state.preloading || state.preloaded) {
      return;
    }

    try {
      this.ipcManager.setASRPreloadState(true, false);
      console.log('[ASR] 开始预加载ASR模型...');

      // 获取或创建共享的 ASRManager 实例
      const asrManager = this.ipcManager.getOrCreateASRManager();

      // 设置事件发射器
      if (this.emitASREvent) {
        asrManager.setEventEmitter(this.emitASREvent);
      }

      // 设置服务器崩溃回调
      // 注意：这会覆盖 IPCManager 中设置的回调，但逻辑是兼容的
      asrManager.setServerCrashCallback((exitCode) => {
        console.error(`[ASR] 服务器崩溃 (code: ${exitCode})，重置预加载状态`);
        this.ipcManager.setASRPreloadState(false, false);

        if (this.serverCrashCallback) {
          this.serverCrashCallback(exitCode);
        }
      });

      // 只初始化模型，不设置conversationId（因为还没有对话）
      await asrManager.initialize(null);

      this.ipcManager.setASRPreloadState(false, true);
      console.log('[ASR] ASR模型预加载完成');
    } catch (error) {
      console.error('[ASR] 预加载ASR模型失败:', error);
      this.ipcManager.setASRPreloadState(false, false);
      // 预加载失败不影响应用启动，后续使用时再加载
    }
  }

  /**
   * 重新加载 ASR 模型
   */
  async reload() {
    console.log('[ASR] 重新加载 ASR 模型');

    // 使用 IPCManager 清理现有实例
    await this.ipcManager.reloadASRModel();

    // 重新预加载
    await this.preload();
    console.log('[ASR] ASR 模型重新加载完成');
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 资源清理主要由 IPCManager 负责，这里不需要做额外操作
    console.log('ASR预加载器已清理');
  }
}