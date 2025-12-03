import { useState, useRef, useCallback, useEffect } from 'react';
import {
  attachAudioContextDebugHandlers,
  analyzeAudioVolume,
  closeAudioContext
} from '../utils/audioUtils.js';

/**
 * 音频捕获管理的自定义Hook
 */
export const useAudioCapture = () => {
  // 状态
  const [isListening, setIsListening] = useState(false);
  const [audioStatus, setAudioStatus] = useState('');
  const [desktopCapturerError, setDesktopCapturerError] = useState(null);
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [systemVolumeLevel, setSystemVolumeLevel] = useState(0);
  const [totalVolumeLevel, setTotalVolumeLevel] = useState(0);

  // Refs
  const micAudioContextRef = useRef(null);
  const systemAudioContextRef = useRef(null);
  const audioContextRef = useRef(null); // 保留用于兼容性
  const micAnalyserRef = useRef(null);
  const systemAnalyserRef = useRef(null);
  const totalAnalyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const systemAudioRef = useRef(null);
  const systemAudioElementRef = useRef(null);
  const micDataArrayRef = useRef(null);
  const systemDataArrayRef = useRef(null);
  const totalDataArrayRef = useRef(null);
  const animationIdRef = useRef(null);
  const audioContextStateLogRef = useRef({ mic: null, system: null });

  /**
   * 清理所有音频资源
   */
  const cleanup = useCallback(async () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    if (microphoneRef.current) {
      microphoneRef.current.getTracks().forEach(track => track.stop());
      microphoneRef.current = null;
    }

    if (systemAudioRef.current) {
      systemAudioRef.current.getTracks().forEach(track => track.stop());
      systemAudioRef.current = null;
    }

    if (systemAudioElementRef.current) {
      systemAudioElementRef.current.pause();
      systemAudioElementRef.current.srcObject = null;
      systemAudioElementRef.current = null;
    }

    // 关闭所有AudioContext
    await Promise.all([
      closeAudioContext(micAudioContextRef.current),
      closeAudioContext(systemAudioContextRef.current),
      closeAudioContext(audioContextRef.current)
    ]);

    micAudioContextRef.current = null;
    systemAudioContextRef.current = null;
    audioContextRef.current = null;

    // 清理分析器引用
    micAnalyserRef.current = null;
    systemAnalyserRef.current = null;
    totalAnalyserRef.current = null;
    audioContextStateLogRef.current = { mic: null, system: null };
  }, []);

  /**
   * 分析音频音量并更新UI
   */
  const analyzeAudio = useCallback(() => {
    // 检查是否至少有一个 AudioContext 在运行
    const micContextActive = micAudioContextRef.current && micAudioContextRef.current.state !== 'closed';
    const systemContextActive = systemAudioContextRef.current && systemAudioContextRef.current.state !== 'closed';

    if (!micContextActive && !systemContextActive) {
      return;
    }

    let hasMic = false;
    let hasSystem = false;
    let micVolume = 0;
    let systemVolume = 0;

    // 分析麦克风音量
    if (micAnalyserRef.current && micDataArrayRef.current && micContextActive) {
      micVolume = analyzeAudioVolume(micAnalyserRef.current, micDataArrayRef.current);
      setMicVolumeLevel(micVolume);
      hasMic = micVolume > 2;
    }

    // 分析系统音频音量
    if (systemAnalyserRef.current && systemDataArrayRef.current && systemContextActive) {
      systemVolume = analyzeAudioVolume(systemAnalyserRef.current, systemDataArrayRef.current);
      setSystemVolumeLevel(systemVolume);
      hasSystem = systemVolume > 2;
    }

    // 计算总体音量（两个音源的最大值，而不是平均值，以便更好地显示活动）
    const totalVolume = Math.max(micVolume, systemVolume);
    setTotalVolumeLevel(totalVolume);

    // 更新状态文本
    let statusText = '正在监听';
    const activeSources = [];
    if (hasMic) activeSources.push('麦克风');
    if (hasSystem) activeSources.push('系统音频');

    if (activeSources.length > 0) {
      statusText += ` - ${activeSources.join(' + ')} 有输入`;
    } else {
      statusText += ' - 等待音频输入...';
    }

    setAudioStatus(statusText);

    animationIdRef.current = requestAnimationFrame(analyzeAudio);
  }, []);

  /**
   * 停止监听
   */
  const stopListening = useCallback(async () => {
    await cleanup();
    setIsListening(false);
    setAudioStatus('监听已停止');
    setMicVolumeLevel(0);
    setSystemVolumeLevel(0);
    setTotalVolumeLevel(0);
  }, [cleanup]);

  /**
   * 开始监听
   * @param {Object} options - 选项
   * @param {string} options.selectedAudioDevice - 选中的音频设备ID
   * @param {boolean} options.captureSystemAudio - 是否捕获系统音频
   */
  const startListening = useCallback(async ({
    selectedAudioDevice,
    captureSystemAudio
  }) => {
    try {
      // 停止之前的监听（如果有）并等待清理完成
      await stopListening();

      // 额外等待一小段时间确保浏览器音频子系统完全释放
      await new Promise(resolve => setTimeout(resolve, 200));

      setAudioStatus('正在检查权限...');
      setDesktopCapturerError(null);

      // macOS: 先检查并请求麦克风权限
      if (window.electronAPI?.checkMediaAccessStatus) {
        const micStatus = await window.electronAPI.checkMediaAccessStatus('microphone');
        console.log('[Settings] 麦克风权限状态:', micStatus);

        if (micStatus.status !== 'granted') {
          setAudioStatus('正在请求麦克风权限...');
          const result = await window.electronAPI.requestMediaAccess('microphone');
          console.log('[Settings] 麦克风权限请求结果:', result);

          if (!result.granted) {
            throw new Error(result.message || '麦克风权限被拒绝，请在系统设置中允许');
          }
        }
      }

      setAudioStatus('正在初始化音频...');

      let sourceCount = 0;
      let micStreamObtained = false;

      // 1. 捕获麦克风音频 - 使用独立的 AudioContext
      setAudioStatus('正在获取麦克风...');
      try {
        // 为麦克风创建独立的 AudioContext，强制使用 48kHz 采样率以减少冲突
        const audioContextOptions = { sampleRate: 48000, latencyHint: 'playback' };
        micAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)(audioContextOptions);
        attachAudioContextDebugHandlers(micAudioContextRef.current, 'mic');

        const micAnalyser = micAudioContextRef.current.createAnalyser();
        micAnalyser.fftSize = 256;
        micAnalyser.smoothingTimeConstant = 0.8;
        micAnalyserRef.current = micAnalyser;
        micDataArrayRef.current = new Uint8Array(micAnalyser.frequencyBinCount);

        const micConstraints = {
          audio: {
            deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
            echoCancellation: true,
            noiseSuppression: true
          }
        };

        const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
        microphoneRef.current = micStream;

        const micSource = micAudioContextRef.current.createMediaStreamSource(micStream);
        micSource.connect(micAnalyser);
        sourceCount++;
        micStreamObtained = true;
        console.log('[Settings] ✅ 麦克风捕获成功');
      } catch (micError) {
        console.error('[Settings] ❌ 麦克风捕获失败:', micError);
        // 麦克风捕获失败时，如果也要捕获系统音频，继续执行；否则抛出错误
        if (!captureSystemAudio) {
          throw micError;
        }
        setAudioStatus(`⚠️ 麦克风捕获失败: ${micError.message}，尝试捕获系统音频...`);
      }

      // 2. 如果启用了系统音频捕获，使用 electron-audio-loopback
      if (captureSystemAudio) {
        setAudioStatus('正在尝试捕获系统音频...');
        console.log('[Settings] 系统音频捕获: 使用 electron-audio-loopback...');

        // 为系统音频创建独立的 AudioContext
        await new Promise(resolve => setTimeout(resolve, 500));

        const sysAudioContextOptions = { sampleRate: 48000, latencyHint: 'playback' };
        systemAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)(sysAudioContextOptions);

        attachAudioContextDebugHandlers(systemAudioContextRef.current, 'system');

        const systemAnalyser = systemAudioContextRef.current.createAnalyser();
        systemAnalyser.fftSize = 256;
        systemAnalyser.smoothingTimeConstant = 0.8;
        systemAnalyserRef.current = systemAnalyser;
        systemDataArrayRef.current = new Uint8Array(systemAnalyser.frequencyBinCount);

        try {
          // 使用 electron-audio-loopback 方案
          // 1. 启用 loopback 音频
          if (window.electronAPI?.enableLoopbackAudio) {
            await window.electronAPI.enableLoopbackAudio();
            console.log('[Settings] Loopback audio enabled');
          }

          // 2. 使用 getDisplayMedia 获取系统音频
          setAudioStatus('正在获取系统音频...');
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
          });

          // 3. 禁用 loopback 音频
          if (window.electronAPI?.disableLoopbackAudio) {
            await window.electronAPI.disableLoopbackAudio();
            console.log('[Settings] Loopback audio disabled');
          }

          // 4. 停止视频轨道
          const videoTracks = displayStream.getVideoTracks();
          videoTracks.forEach(track => {
            track.stop();
            displayStream.removeTrack(track);
            console.log(`[Settings] Video track stopped: ${track.label}`);
          });

          // 5. 检查音频轨道
          const audioTracks = displayStream.getAudioTracks();
          console.log(`[Settings] 系统音频流: ${audioTracks.length} 个音频轨道`);

          if (audioTracks.length > 0) {
            systemAudioRef.current = displayStream;

            const systemSource = systemAudioContextRef.current.createMediaStreamSource(displayStream);
            systemSource.connect(systemAnalyser);
            sourceCount++;

            if (systemAudioContextRef.current.state === 'suspended') {
              await systemAudioContextRef.current.resume();
            }

            console.log(`[Settings] ✅ 系统音频捕获已启动 (electron-audio-loopback)`);
            setAudioStatus('✅ 系统音频捕获成功');
            setDesktopCapturerError(null);
          } else {
            console.warn(`[Settings] ⚠️ 没有音频轨道`);
            displayStream.getTracks().forEach(track => track.stop());
            setDesktopCapturerError('没有音频轨道');
          }
        } catch (systemError) {
          console.error('[Settings] ❌ 系统音频捕获失败:', systemError);

          // 确保禁用 loopback
          if (window.electronAPI?.disableLoopbackAudio) {
            await window.electronAPI.disableLoopbackAudio().catch(() => { });
          }

          const errorMsg = systemError.message || '未知错误';
          if (micStreamObtained) {
            console.warn(`[Settings] 麦克风将继续工作，但无法捕获系统音频`);
          }
          setDesktopCapturerError(`捕获失败: ${errorMsg}`);
        }
      }

      // 检查是否至少有一个音频源成功捕获
      if (sourceCount === 0) {
        throw new Error('没有成功捕获任何音频源。请检查设备连接和权限设置。');
      }

      // 3. 总计音量将在 analyzeAudio 中通过软件方式计算（两个独立 AudioContext 的平均值）
      // 不再使用硬件合并，因为两个 AudioContext 无法直接连接
      totalDataArrayRef.current = new Uint8Array(128); // 用于存储计算后的总音量数据

      // 构建状态信息
      const capturedSources = [];
      if (micStreamObtained) capturedSources.push('麦克风');
      if (systemAudioRef.current) capturedSources.push('系统音频');

      const statusMsg = capturedSources.length > 0
        ? `正在监听 (${capturedSources.join(' + ')})...`
        : '监听中...';

      setAudioStatus(statusMsg);
      setIsListening(true);

      console.log(`[Settings] ✅ 音频监听已启动: ${capturedSources.join(', ') || '无'}`);

      analyzeAudio();

    } catch (error) {
      console.error('启动监听失败:', error);
      console.error('错误名称:', error.name);
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);

      // 针对常见错误提供更友好的提示
      let errorMsg = error.message;
      if (error.name === 'NotFoundError') {
        errorMsg = '未找到音频设备。请检查麦克风是否正确连接，或尝试选择其他设备。';
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMsg = '音频权限被拒绝。请在系统设置中允许此应用访问麦克风。';
      } else if (error.name === 'NotReadableError') {
        errorMsg = '无法读取音频设备。设备可能被其他应用占用。';
      }

      setAudioStatus(`启动失败: ${errorMsg}`);
      setIsListening(false);

      // 清理可能部分创建的资源
      await cleanup();
    }
  }, [analyzeAudio, stopListening, cleanup]);

  // 设置全局错误处理器
  useEffect(() => {
    const handleWindowError = (event) => {
      if (event?.message?.includes('AudioContext')) {
        console.error('[AudioDebug] 捕获到全局 AudioContext 错误:', event.message, event.error);
      }
    };

    window.addEventListener('error', handleWindowError);
    return () => window.removeEventListener('error', handleWindowError);
  }, []);

  return {
    // 状态
    isListening,
    audioStatus,
    desktopCapturerError,
    micVolumeLevel,
    systemVolumeLevel,
    totalVolumeLevel,

    // 方法
    startListening,
    stopListening
  };
};