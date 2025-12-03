import { useState, useCallback, useRef } from 'react';

/**
 * 音频设备管理的自定义Hook
 */
export const useAudioDevices = () => {
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false);
  const [selectedSystemAudioDevice, setSelectedSystemAudioDevice] = useState('');
  const [audioSources, setAudioSources] = useState([]);
  const [speaker1Source, setSpeaker1Source] = useState(null); // 用户（麦克风）
  const [speaker2Source, setSpeaker2Source] = useState(null); // 角色（系统音频）

  // 用于跟踪是否已经自动保存过，避免重复保存
  const autoSavedRef = useRef(false);

  /**
   * 加载音频设备列表
   */
  const loadAudioDevices = useCallback(async () => {
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
  }, [speaker1Source, selectedAudioDevice]);

  /**
   * 加载音频源配置
   */
  const loadAudioSources = useCallback(async () => {
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
  }, []);

  /**
   * 保存音频源配置
   * @param {string} sourceName - 音频源名称
   * @param {string} deviceId - 设备ID
   * @param {string} deviceName - 设备名称
   * @param {boolean} isActive - 是否激活
   */
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
  }, [loadAudioSources]);

  /**
   * 处理音频设备选择变化
   */
  const handleAudioDeviceChange = useCallback(async (deviceId) => {
    setSelectedAudioDevice(deviceId);
    const device = audioDevices.find(d => d.deviceId === deviceId);
    if (device) {
      await saveAudioSource('用户（麦克风）', deviceId, device.label || device.deviceId, true);
    }
  }, [audioDevices, saveAudioSource]);

  /**
   * 处理系统音频捕获开关变化
   */
  const handleSystemAudioToggle = useCallback(async (checked) => {
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
  }, [speaker2Source, selectedSystemAudioDevice, saveAudioSource]);

  /**
   * 初始化音频设备
   */
  const initializeAudioDevices = useCallback(async () => {
    // 先加载音频源配置，再加载设备列表（因为设备列表需要用到音频源配置）
    await loadAudioSources();
    await loadAudioDevices();
  }, [loadAudioSources, loadAudioDevices]);

  /**
   * 当音频源配置加载完成后，更新设备选择并自动保存
   */
  const handleAudioSourcesLoaded = useCallback(async () => {
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
  }, [speaker1Source, speaker2Source, audioDevices, captureSystemAudio, selectedAudioDevice, selectedSystemAudioDevice, saveAudioSource]);

  return {
    // 状态
    audioDevices,
    selectedAudioDevice,
    captureSystemAudio,
    selectedSystemAudioDevice,
    audioSources,
    speaker1Source,
    speaker2Source,

    // 方法
    loadAudioDevices,
    loadAudioSources,
    saveAudioSource,
    handleAudioDeviceChange,
    handleSystemAudioToggle,
    initializeAudioDevices,
    handleAudioSourcesLoaded
  };
};