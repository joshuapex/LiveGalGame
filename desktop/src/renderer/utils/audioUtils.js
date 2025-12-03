/**
 * 音频处理工具函数
 */

let audioContextStateLogRef = { mic: null, system: null };

/**
 * 记录AudioContext的详细信息
 * @param {AudioContext} context - AudioContext实例
 * @param {string} label - 标签（mic/system）
 */
export const logAudioContextDetails = (context, label) => {
  if (!context) {
    console.warn(`[AudioDebug] ${label} AudioContext 不存在或已销毁`);
    return;
  }

  const details = {
    state: context.state,
    sampleRate: context.sampleRate,
    baseLatency: context.baseLatency ?? 'n/a',
    outputLatency: context.outputLatency ?? 'n/a',
    currentTime: Number(context.currentTime.toFixed(3))
  };

  console.log(`[AudioDebug] ${label} AudioContext 详情:`, details);
};

/**
 * 为AudioContext附加调试处理器
 * @param {AudioContext} context - AudioContext实例
 * @param {string} label - 标签（mic/system）
 */
export const attachAudioContextDebugHandlers = (context, label) => {
  if (!context) return;

  const handler = () => {
    const prevState = audioContextStateLogRef.current?.[label];
    if (prevState !== context.state) {
      console.log(`[AudioDebug] ${label} AudioContext 状态: ${context.state}`);
      audioContextStateLogRef.current = audioContextStateLogRef.current || {};
      audioContextStateLogRef.current[label] = context.state;
    }

    if (context.state === 'suspended') {
      console.warn(`[AudioDebug] ${label} AudioContext 已暂停，尝试恢复...`);
    } else if (context.state === 'closed') {
      console.warn(`[AudioDebug] ${label} AudioContext 已关闭`);
    }
  };

  context.onstatechange = handler;
  logAudioContextDetails(context, label);
};

/**
 * 创建全局错误处理器用于AudioContext错误
 * @param {Function} logAudioContextDetails - 日志函数引用
 * @returns {Function} 清理函数
 */
export const createAudioErrorHandler = (logAudioContextDetails, micRef, sysRef) => {
  const handleWindowError = (event) => {
    if (event?.message?.includes('AudioContext')) {
      console.error('[AudioDebug] 捕获到全局 AudioContext 错误:', event.message, event.error);

      if (typeof logAudioContextDetails === 'function') {
        logAudioContextDetails(micRef?.current, '麦克风');
        logAudioContextDetails(sysRef?.current, '系统音频');
      }
    }
  };

  window.addEventListener('error', handleWindowError);
  return () => window.removeEventListener('error', handleWindowError);
};

/**
 * 分析音频音量
 * @param {AnalyserNode} analyser - 分析器节点
 * @param {Uint8Array} dataArray - 数据数组
 * @returns {number} 音量百分比 (0-100)
 */
export const analyzeAudioVolume = (analyser, dataArray) => {
  if (!analyser || !dataArray) return 0;

  try {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    return Math.min(100, (average / 255) * 100);
  } catch (e) {
    console.warn('[AudioDebug] 分析音频音量时出错:', e);
    return 0;
  }
};

/**
 * 关闭AudioContext
 * @param {AudioContext} context - AudioContext实例
 */
export const closeAudioContext = async (context) => {
  if (!context) return;

  context.onstatechange = null;
  try {
    if (context.state !== 'closed') {
      await context.close();
    }
  } catch (e) {
    console.warn('关闭 AudioContext 时出错:', e);
  }
};