import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

function Settings() {
  // LLM 配置
  const [llmConfigs, setLlmConfigs] = useState([]);
  const [defaultConfig, setDefaultConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddConfig, setShowAddConfig] = useState(false);
  const [newConfig, setNewConfig] = useState({
    name: '',
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    isDefault: false
  });

  // 音频设备设置
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false);
  const [selectedSystemAudioDevice, setSelectedSystemAudioDevice] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [audioStatus, setAudioStatus] = useState('');
  const [desktopCapturerError, setDesktopCapturerError] = useState(null);
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [systemVolumeLevel, setSystemVolumeLevel] = useState(0);
  const [totalVolumeLevel, setTotalVolumeLevel] = useState(0);
  // 使用独立的 AudioContext 避免采样率冲突
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

  // 音频源配置（从数据库加载）
  const [audioSources, setAudioSources] = useState([]);
  const [speaker1Source, setSpeaker1Source] = useState(null); // 用户（麦克风）
  const [speaker2Source, setSpeaker2Source] = useState(null); // 角色（系统音频）

  // ASR（语音识别）配置
  const [asrConfigs, setAsrConfigs] = useState([]);
  const [asrDefaultConfig, setAsrDefaultConfig] = useState(null);
  const [asrLoading, setAsrLoading] = useState(true);
  const [showAddAsrConfig, setShowAddAsrConfig] = useState(false);
  const logAudioContextDetails = useCallback((context, label) => {
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
  }, []);

  const attachAudioContextDebugHandlers = useCallback((context, label) => {
    if (!context) return;

    const handler = () => {
      const prevState = audioContextStateLogRef.current[label];
      if (prevState !== context.state) {
        console.log(`[AudioDebug] ${label} AudioContext 状态: ${context.state}`);
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
  }, [logAudioContextDetails]);

  useEffect(() => {
    const handleWindowError = (event) => {
      if (event?.message?.includes('AudioContext')) {
        console.error('[AudioDebug] 捕获到全局 AudioContext 错误:', event.message, event.error);
        logAudioContextDetails(micAudioContextRef.current, '麦克风');
        logAudioContextDetails(systemAudioContextRef.current, '系统音频');

        setAudioStatus(prev => {
          const prefix = prev && !prev.includes('AudioContext 错误') ? `${prev} | ` : '';
          return `${prefix}AudioContext 错误: ${event.message}`;
        });
      }
    };

    window.addEventListener('error', handleWindowError);
    return () => window.removeEventListener('error', handleWindowError);
  }, [logAudioContextDetails]);
  const [newAsrConfig, setNewAsrConfig] = useState({
    model_name: 'whisper-base',
    language: 'zh',
    enable_vad: true,
    sentence_pause_threshold: 1.0,
    retain_audio_files: false,
    audio_retention_days: 30,
    audio_storage_path: ''
  });;

  // 保存音频源配置（使用 useCallback 避免无限循环，但不依赖 audioSources）
  const saveAudioSource = useCallback(async (sourceName, deviceId, deviceName, isActive = true) => {
    try {
      const api = window.electronAPI;
      if (!api?.asrCreateAudioSource || !api?.asrUpdateAudioSource) {
        console.warn('ASR API 不可用');
        return;
      }

      // 确定音频源的固定ID（关键：必须使用固定的ID才能与外键约束匹配）
      const sourceId = sourceName === '用户（麦克风）' ? 'speaker1' : 'speaker2';

      console.log('保存音频源配置:', { sourceId, sourceName, deviceId, deviceName, isActive });

      // 重新获取最新的音频源列表，避免使用过期的 audioSources
      const currentSources = await api.asrGetAudioSources();

      // 使用固定的ID查找是否已存在该音频源（而不是名称匹配）
      const existingSource = currentSources.find(s => s.id === sourceId);

      const updateData = {
        name: sourceName,
        device_id: deviceId,
        device_name: deviceName,
        is_active: isActive ? 1 : 0
      };

      if (existingSource) {
        // 更新现有配置
        console.log('更新现有音频源:', existingSource.id, updateData);
        const result = await api.asrUpdateAudioSource(existingSource.id, updateData);
        console.log('更新结果:', result);
      } else {
        // 创建新配置（必须指定固定的ID）
        const createData = {
          id: sourceId, // 关键：使用固定的ID
          ...updateData
        };
        console.log('创建新音频源:', createData);
        const result = await api.asrCreateAudioSource(createData);
        console.log('创建结果:', result);
      }

      // 重新加载音频源配置
      await loadAudioSources();

      // 验证保存结果（使用ID查找）
      const updatedSources = await api.asrGetAudioSources();
      const savedSource = updatedSources.find(s => s.id === sourceId);
      console.log('保存后的音频源:', savedSource);

      if (savedSource) {
        console.log(`✓ 音频源配置已保存: ${sourceName} (ID: ${sourceId}), is_active=${savedSource.is_active}`);
      } else {
        console.warn(`⚠ 音频源配置保存后未找到: ${sourceName} (ID: ${sourceId})`);
      }
    } catch (error) {
      console.error('保存音频源配置失败:', error);
      alert('保存音频源配置失败：' + (error.message || '未知错误'));
    }
  }, []); // 移除 audioSources 依赖，改为在函数内部获取最新数据

  // 用于跟踪是否已经自动保存过，避免重复保存
  const autoSavedRef = useRef(false);

  useEffect(() => {
    loadConfigs();
    // 先加载音频源配置，再加载设备列表（因为设备列表需要用到音频源配置）
    loadAudioSources().then(() => {
      loadAudioDevices();
    });
  }, []);

  // 当音频源配置加载完成后，更新设备选择并自动保存
  useEffect(() => {
    const initializeAndSave = async () => {
      // 如果speaker1Source存在但device_id为null，自动选择第一个可用设备并保存
      if (speaker1Source && !speaker1Source.device_id && audioDevices.length > 0 && !autoSavedRef.current) {
        const firstDevice = audioDevices[0];
        console.log('自动选择并保存第一个麦克风设备:', firstDevice.deviceId);
        setSelectedAudioDevice(firstDevice.deviceId);
        // 标记为已保存，避免重复
        autoSavedRef.current = true;
        // 直接保存到数据库
        await saveAudioSource('用户（麦克风）', firstDevice.deviceId, firstDevice.label || firstDevice.deviceId, true);
      } else if (speaker1Source?.device_id && audioDevices.length > 0) {
        const device = audioDevices.find(d => d.deviceId === speaker1Source.device_id);
        if (device && selectedAudioDevice !== device.deviceId) {
          setSelectedAudioDevice(device.deviceId);
        }
      }
      if (speaker2Source?.device_id && audioDevices.length > 0 && captureSystemAudio) {
        const device = audioDevices.find(d => d.deviceId === speaker2Source.device_id);
        if (device && selectedSystemAudioDevice !== device.deviceId) {
          setSelectedSystemAudioDevice(device.deviceId);
        }
      }
    };

    initializeAndSave();
  }, [speaker1Source, speaker2Source, audioDevices, captureSystemAudio, saveAudioSource]);

  const loadAudioDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('浏览器不支持音频设备枚举');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);

      // 如果没有已保存的配置，选择第一个设备作为默认值
      if (!speaker1Source && audioInputs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
    } catch (error) {
      console.error('加载音频设备失败:', error);
    }
  };


  // 加载音频源配置
  const loadAudioSources = async () => {
    try {
      const api = window.electronAPI;
      if (!api?.asrGetAudioSources) {
        console.warn('ASR API 不可用');
        return;
      }

      const sources = await api.asrGetAudioSources();
      setAudioSources(sources || []);

      // 查找 Speaker 1（用户/麦克风）和 Speaker 2（角色/系统音频）
      // 使用固定的ID查找（而不是名称匹配），确保与外键约束一致
      const speaker1 = sources.find(s => s.id === 'speaker1');
      const speaker2 = sources.find(s => s.id === 'speaker2');

      setSpeaker1Source(speaker1 || null);
      setSpeaker2Source(speaker2 || null);

      // 如果找到了配置，更新UI状态
      if (speaker1) {
        setSelectedAudioDevice(speaker1.device_id || '');
      }
      if (speaker2) {
        // 根据 is_active 决定是否默认勾选系统音频捕获
        const isActive = speaker2.is_active === 1 || speaker2.is_active === true || speaker2.is_active === '1';
        setCaptureSystemAudio(isActive);
        setSelectedSystemAudioDevice(speaker2.device_id || '');
      }
    } catch (error) {
      console.error('加载音频源配置失败:', error);
    }
  };

  const startListening = async () => {
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
      await stopListening();
    }
  };

  const stopListening = async () => {
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

    // 关闭麦克风的 AudioContext
    if (micAudioContextRef.current) {
      micAudioContextRef.current.onstatechange = null;
      try {
        if (micAudioContextRef.current.state !== 'closed') {
          await micAudioContextRef.current.close();
        }
      } catch (e) {
        console.warn('关闭麦克风 AudioContext 时出错:', e);
      }
      micAudioContextRef.current = null;
    }

    // 关闭系统音频的 AudioContext
    if (systemAudioContextRef.current) {
      systemAudioContextRef.current.onstatechange = null;
      try {
        if (systemAudioContextRef.current.state !== 'closed') {
          await systemAudioContextRef.current.close();
        }
      } catch (e) {
        console.warn('关闭系统音频 AudioContext 时出错:', e);
      }
      systemAudioContextRef.current = null;
    }

    // 兼容性：清理旧的 audioContextRef
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          await audioContextRef.current.close();
        }
      } catch (e) {
        console.warn('关闭 AudioContext 时出错:', e);
      }
      audioContextRef.current = null;
    }

    // 清理分析器引用
    micAnalyserRef.current = null;
    systemAnalyserRef.current = null;
    totalAnalyserRef.current = null;
    audioContextStateLogRef.current = { mic: null, system: null };

    setIsListening(false);
    setAudioStatus('监听已停止');
    setMicVolumeLevel(0);
    setSystemVolumeLevel(0);
    setTotalVolumeLevel(0);
  };

  const analyzeAudio = () => {
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
      try {
        micAnalyserRef.current.getByteFrequencyData(micDataArrayRef.current);
        let micSum = 0;
        for (let i = 0; i < micDataArrayRef.current.length; i++) {
          micSum += micDataArrayRef.current[i];
        }
        const micAverage = micSum / micDataArrayRef.current.length;
        micVolume = Math.min(100, (micAverage / 255) * 100);
        setMicVolumeLevel(micVolume);
        hasMic = micVolume > 2;
      } catch (e) {
        console.warn('[Settings] 分析麦克风音量时出错:', e);
      }
    }

    // 分析系统音频音量
    if (systemAnalyserRef.current && systemDataArrayRef.current && systemContextActive) {
      try {
        systemAnalyserRef.current.getByteFrequencyData(systemDataArrayRef.current);
        let systemSum = 0;
        for (let i = 0; i < systemDataArrayRef.current.length; i++) {
          systemSum += systemDataArrayRef.current[i];
        }
        const systemAverage = systemSum / systemDataArrayRef.current.length;
        systemVolume = Math.min(100, (systemAverage / 255) * 100);
        setSystemVolumeLevel(systemVolume);
        hasSystem = systemVolume > 2;
      } catch (e) {
        console.warn('[Settings] 分析系统音频音量时出错:', e);
      }
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
  };

  const loadConfigs = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.getAllLLMConfigs) {
        const configs = await window.electronAPI.getAllLLMConfigs();
        setLlmConfigs(configs);
      }
      if (window.electronAPI?.getDefaultLLMConfig) {
        const defaultCfg = await window.electronAPI.getDefaultLLMConfig();
        setDefaultConfig(defaultCfg);
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddConfig = async () => {
    try {
      if (!newConfig.name || !newConfig.apiKey) {
        alert('请填写配置名称和API密钥');
        return;
      }

      if (window.electronAPI?.saveLLMConfig) {
        const configData = {
          name: newConfig.name,
          provider: newConfig.provider,
          api_key: newConfig.apiKey,
          base_url: newConfig.baseUrl || null,
          is_default: newConfig.isDefault
        };

        await window.electronAPI.saveLLMConfig(configData);

        // 重置表单
        setNewConfig({
          name: '',
          provider: 'openai',
          apiKey: '',
          baseUrl: '',
          isDefault: false
        });
        setShowAddConfig(false);

        // 重新加载配置列表
        loadConfigs();
      }
    } catch (error) {
      console.error('添加配置失败:', error);
      alert('添加配置失败，请重试');
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* 标题 */}
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 mb-4 transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span>返回</span>
          </Link>
          <h1 className="text-3xl font-bold text-text-light dark:text-text-dark">设置</h1>
          <p className="text-text-muted-light dark:text-text-muted-dark mt-2">
            管理应用设置和LLM配置
          </p>
        </div>

        {/* LLM配置部分 */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl p-6 border border-border-light dark:border-border-dark mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-text-light dark:text-text-dark flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">settings</span>
              LLM配置
            </h2>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-text-muted-light dark:text-text-muted-dark">加载中...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {llmConfigs.length === 0 && !showAddConfig ? (
                <div className="text-center py-8">
                  <p className="text-text-muted-light dark:text-text-muted-dark mb-4">暂无LLM配置</p>
                  <button
                    onClick={() => setShowAddConfig(true)}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    添加配置
                  </button>
                </div>
              ) : (
                <>
                  {!showAddConfig && (
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => setShowAddConfig(true)}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        添加配置
                      </button>
                    </div>
                  )}
                  {llmConfigs.map((config) => (
                    <div
                      key={config.id}
                      className={`p-4 rounded-lg border ${defaultConfig?.id === config.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border-light dark:border-border-dark'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-text-light dark:text-text-dark">
                            {config.name || '未命名配置'}
                            {defaultConfig?.id === config.id && (
                              <span className="ml-2 text-xs bg-primary text-white px-2 py-1 rounded">
                                默认
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-text-muted-light dark:text-text-muted-dark mt-1">
                            {config.provider || '未知提供商'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {defaultConfig?.id !== config.id && (
                            <button
                              onClick={async () => {
                                if (window.electronAPI?.setDefaultLLMConfig) {
                                  await window.electronAPI.setDefaultLLMConfig(config.id);
                                  loadConfigs();
                                }
                              }}
                              className="px-3 py-1 text-sm border border-border-light dark:border-border-dark rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                            >
                              设为默认
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (window.electronAPI?.deleteLLMConfig) {
                                if (confirm('确定要删除这个配置吗？')) {
                                  await window.electronAPI.deleteLLMConfig(config.id);
                                  loadConfigs();
                                }
                              }
                            }}
                            className="px-3 py-1 text-sm text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {showAddConfig && (
                    <div className="p-4 rounded-lg border-2 border-dashed border-primary bg-primary/5">
                      <h3 className="font-semibold text-text-light dark:text-text-dark mb-4">添加新配置</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
                            配置名称
                          </label>
                          <input
                            type="text"
                            value={newConfig.name}
                            onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="例如：OpenAI GPT-4"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
                            API 密钥
                          </label>
                          <input
                            type="password"
                            value={newConfig.apiKey}
                            onChange={(e) => setNewConfig({ ...newConfig, apiKey: e.target.value })}
                            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="sk-..."
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
                            Base URL（可选）
                          </label>
                          <input
                            type="text"
                            value={newConfig.baseUrl}
                            onChange={(e) => setNewConfig({ ...newConfig, baseUrl: e.target.value })}
                            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="https://api.openai.com/v1"
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id="isDefault"
                            checked={newConfig.isDefault}
                            onChange={(e) => setNewConfig({ ...newConfig, isDefault: e.target.checked })}
                            className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                          />
                          <label htmlFor="isDefault" className="text-sm text-text-light dark:text-text-dark">
                            设为默认配置
                          </label>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={handleAddConfig}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                          >
                            保存配置
                          </button>
                          <button
                            onClick={() => {
                              setShowAddConfig(false);
                              setNewConfig({
                                name: '',
                                provider: 'openai',
                                apiKey: '',
                                baseUrl: '',
                                isDefault: false
                              });
                            }}
                            className="px-4 py-2 border border-border-light dark:border-border-dark rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 音频设置 */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl p-6 border border-border-light dark:border-border-dark mb-6">
          <h2 className="text-xl font-semibold text-text-light dark:text-text-dark mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">mic</span>
            音频输入设置
          </h2>

          {audioDevices.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-text-muted-light dark:text-text-muted-dark mb-4">
                未检测到音频输入设备
              </p>
              <button
                onClick={loadAudioDevices}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                重新扫描
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
                  用户（麦克风）设备 *
                </label>
                <select
                  value={selectedAudioDevice}
                  onChange={async (e) => {
                    const deviceId = e.target.value;
                    setSelectedAudioDevice(deviceId);
                    const device = audioDevices.find(d => d.deviceId === deviceId);
                    if (device) {
                      await saveAudioSource('用户（麦克风）', deviceId, device.label || device.deviceId, true);
                    }
                  }}
                  className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `麦克风 ${device.deviceId.substring(0, 8)}`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
                  选择要使用的麦克风设备（用于识别用户说话）
                </p>
                {speaker1Source && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">check_circle</span>
                    已保存配置
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="systemAudio"
                  checked={captureSystemAudio}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setCaptureSystemAudio(checked);

                    // 统一通过 saveAudioSource 确保存在 speaker2 配置：
                    // - 如果之前没有 speaker2Source，会自动创建
                    // - 如果已有，则仅更新 is_active
                    try {
                      const deviceId =
                        (speaker2Source && speaker2Source.device_id) ||
                        selectedSystemAudioDevice ||
                        'system-loopback';
                      const deviceName =
                        (speaker2Source && speaker2Source.device_name) ||
                        '系统音频（屏幕捕获）';

                      await saveAudioSource(
                        '角色（系统音频）',
                        deviceId,
                        deviceName,
                        checked
                      );
                    } catch (err) {
                      console.error('更新系统音频源配置失败:', err);
                    }

                    if (!checked) {
                      // 关闭系统音频时清理错误提示
                      setDesktopCapturerError(null);
                    }
                  }}
                  className="rounded border-border-light dark:border-border-dark text-primary focus:ring-primary"
                />
                <label htmlFor="systemAudio" className="text-sm font-medium text-text-light dark:text-text-dark">
                  同时捕获系统音频（角色音频）
                </label>
              </div>



              <div className="border-t border-border-light dark:border-border-dark pt-4">
                <h3 className="text-sm font-medium text-text-light dark:text-text-dark mb-3">
                  测试麦克风监听
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {!isListening ? (
                      <button
                        onClick={startListening}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">mic</span>
                        开始监听
                      </button>
                    ) : (
                      <button
                        onClick={stopListening}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined animate-pulse">stop_circle</span>
                        停止监听
                      </button>
                    )}
                  </div>

                  {isListening && (
                    <div className="space-y-3">
                      <div className={`text-sm font-medium flex items-center gap-2 ${audioStatus.includes('✅') || audioStatus.includes('成功') ? 'text-green-600 dark:text-green-400' :
                        audioStatus.includes('⚠️') || audioStatus.includes('❌') || audioStatus.includes('失败') || audioStatus.includes('错误') ? 'text-red-600 dark:text-red-400' :
                          'text-text-muted-light dark:text-text-muted-dark'
                        }`}>
                        {audioStatus.includes('✅') || audioStatus.includes('成功') ? (
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                        ) : audioStatus.includes('⚠️') || audioStatus.includes('❌') || audioStatus.includes('失败') || audioStatus.includes('错误') ? (
                          <span className="material-symbols-outlined text-sm">error</span>
                        ) : (
                          <span className="material-symbols-outlined text-sm">mic</span>
                        )}
                        {audioStatus.replace(/[✅⚠️❌]/g, '').trim()}
                      </div>

                      {desktopCapturerError && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded border border-orange-200 dark:border-orange-800">
                          <p className="font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">warning</span>
                            原生屏幕音频捕获失败
                          </p>
                          <p className="mt-1 opacity-90">{desktopCapturerError}</p>
                          <p className="mt-1 opacity-80 border-t border-orange-200 dark:border-orange-800 pt-1">
                            自动捕获系统音频失败。请检查系统权限或驱动。
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-16">麦克风</span>
                          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-100"
                              style={{ width: `${micVolumeLevel}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-10">
                            {micVolumeLevel.toFixed(0)}%
                          </span>
                        </div>

                        {captureSystemAudio && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-16">系统音频</span>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-100"
                                style={{ width: `${systemVolumeLevel}%` }}
                              />
                            </div>
                            <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-10">
                              {systemVolumeLevel.toFixed(0)}%
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-3 pt-1 border-t border-gray-200 dark:border-gray-700">
                          <span className="text-xs font-medium text-text-light dark:text-text-dark w-16">总音量</span>
                          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-100"
                              style={{ width: `${totalVolumeLevel}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-10">
                            {totalVolumeLevel.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ASR设置 */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl p-6 border border-border-light dark:border-border-dark mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-text-light dark:text-text-dark flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">mic</span>
              语音识别设置
            </h2>
            <Link
              to="/asr-settings"
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">settings</span>
              管理ASR配置
            </Link>
          </div>
          <p className="text-text-muted-light dark:text-text-muted-dark">
            配置语音识别模型、音频设备和录音选项
          </p>
        </div>

        {/* 其他设置 */}
        <div className="bg-surface-light dark:bg-surface-dark rounded-xl p-6 border border-border-light dark:border-border-dark">
          <h2 className="text-xl font-semibold text-text-light dark:text-text-dark mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">tune</span>
            其他设置
          </h2>
          <p className="text-text-muted-light dark:text-text-muted-dark">
            更多设置选项即将推出
          </p>
        </div>
      </div>
    </div>
  );
}

export default Settings;

