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
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [systemVolumeLevel, setSystemVolumeLevel] = useState(0);
  const [totalVolumeLevel, setTotalVolumeLevel] = useState(0);
  const audioContextRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const systemAnalyserRef = useRef(null);
  const totalAnalyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const systemAudioRef = useRef(null);
  const micDataArrayRef = useRef(null);
  const systemDataArrayRef = useRef(null);
  const totalDataArrayRef = useRef(null);
  const animationIdRef = useRef(null);
  
  // 音频源配置（从数据库加载）
  const [audioSources, setAudioSources] = useState([]);
  const [speaker1Source, setSpeaker1Source] = useState(null); // 用户（麦克风）
  const [speaker2Source, setSpeaker2Source] = useState(null); // 角色（系统音频）

  // ASR（语音识别）配置
  const [asrConfigs, setAsrConfigs] = useState([]);
  const [asrDefaultConfig, setAsrDefaultConfig] = useState(null);
  const [asrLoading, setAsrLoading] = useState(true);
  const [showAddAsrConfig, setShowAddAsrConfig] = useState(false);
  const [newAsrConfig, setNewAsrConfig] = useState({
    model_name: 'whisper-base',
    language: 'zh',
    enable_vad: true,
    sentence_pause_threshold: 1.0,
    retain_audio_files: false,
    audio_retention_days: 30,
    audio_storage_path: ''
  });;

  useEffect(() => {
    loadConfigs();
    // 先加载音频源配置，再加载设备列表（因为设备列表需要用到音频源配置）
    loadAudioSources().then(() => {
      loadAudioDevices();
    });
  }, []);

  // 当音频源配置加载完成后，更新设备选择
  useEffect(() => {
    if (speaker1Source?.device_id && audioDevices.length > 0) {
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
  }, [speaker1Source, speaker2Source, audioDevices]);

  // 当设备列表和音频源配置都加载完成后，如果已选择设备但未保存配置，自动保存
  // 使用 ref 来跟踪是否已经尝试过自动保存，避免重复执行
  const autoSaveAttemptedRef = useRef({ mic: false, system: false });

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

  useEffect(() => {
    const autoSaveIfNeeded = async () => {
      // 如果已选择麦克风设备，但没有保存配置，且还没有尝试过自动保存
      if (selectedAudioDevice && audioDevices.length > 0 && !speaker1Source && !autoSaveAttemptedRef.current.mic) {
        const device = audioDevices.find(d => d.deviceId === selectedAudioDevice);
        if (device) {
          autoSaveAttemptedRef.current.mic = true;
          console.log('自动保存麦克风配置:', device.deviceId);
          await saveAudioSource('用户（麦克风）', device.deviceId, device.label || device.deviceId, true);
        }
      }

      // 如果已选择系统音频设备且已勾选，但没有保存配置，且还没有尝试过自动保存
      if (captureSystemAudio && selectedSystemAudioDevice && audioDevices.length > 0 && !speaker2Source && !autoSaveAttemptedRef.current.system) {
        const device = audioDevices.find(d => d.deviceId === selectedSystemAudioDevice);
        if (device) {
          autoSaveAttemptedRef.current.system = true;
          console.log('自动保存系统音频配置:', device.deviceId);
          await saveAudioSource('角色（系统音频）', device.deviceId, device.label || device.deviceId, true);
        }
      }
    };

    // 延迟执行，确保所有状态都已更新
    if (audioDevices.length > 0 && (selectedAudioDevice || selectedSystemAudioDevice)) {
      const timer = setTimeout(() => {
        autoSaveIfNeeded();
      }, 1000); // 增加延迟时间，确保状态稳定
      return () => clearTimeout(timer);
    }
  }, [selectedAudioDevice, selectedSystemAudioDevice, audioDevices, speaker1Source, speaker2Source, captureSystemAudio]);
  
  // 当 speaker1Source 或 speaker2Source 更新时，重置自动保存标志
  useEffect(() => {
    if (speaker1Source) {
      autoSaveAttemptedRef.current.mic = false;
    }
    if (speaker2Source) {
      autoSaveAttemptedRef.current.system = false;
    }
  }, [speaker1Source, speaker2Source]);

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
        setCaptureSystemAudio(true);
        setSelectedSystemAudioDevice(speaker2.device_id || '');
      }
    } catch (error) {
      console.error('加载音频源配置失败:', error);
    }
  };

  const startListening = async () => {
    try {
      setAudioStatus('正在请求麦克风权限...');

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

      let sourceCount = 0;

      // 1. 捕获麦克风音频并创建独立分析器
      const micAnalyser = audioContextRef.current.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.8;
      micAnalyserRef.current = micAnalyser;
      micDataArrayRef.current = new Uint8Array(micAnalyser.frequencyBinCount);

      const micConstraints = {
        audio: {
          deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      };

      const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);
      microphoneRef.current = micStream;

      const micSource = audioContextRef.current.createMediaStreamSource(micStream);
      micSource.connect(micAnalyser);
      sourceCount++;

      // 2. 如果启用了系统音频捕获，创建第二个独立分析器
      if (captureSystemAudio) {
        setAudioStatus('正在请求系统音频权限...');

        const systemAnalyser = audioContextRef.current.createAnalyser();
        systemAnalyser.fftSize = 256;
        systemAnalyser.smoothingTimeConstant = 0.8;
        systemAnalyserRef.current = systemAnalyser;
        systemDataArrayRef.current = new Uint8Array(systemAnalyser.frequencyBinCount);

        const systemConstraints = {
          audio: {
            deviceId: selectedSystemAudioDevice ? { exact: selectedSystemAudioDevice } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            sampleRate: 44100
          }
        };

        try {
          const systemStream = await navigator.mediaDevices.getUserMedia(systemConstraints);
          systemAudioRef.current = systemStream;

          const systemSource = audioContextRef.current.createMediaStreamSource(systemStream);
          systemSource.connect(systemAnalyser);
          sourceCount++;
        } catch (systemError) {
          console.warn('系统音频捕获失败:', systemError);
          setAudioStatus(`系统音频捕获失败: ${systemError.message}`);
        }
      }

      // 3. 创建总计分析器（用于显示总体音量）
      const totalAnalyser = audioContextRef.current.createAnalyser();
      totalAnalyser.fftSize = 256;
      totalAnalyser.smoothingTimeConstant = 0.8;
      totalAnalyserRef.current = totalAnalyser;
      totalDataArrayRef.current = new Uint8Array(totalAnalyser.frequencyBinCount);

      // 将麦克风和系统音频都连接到总计分析器
      if (microphoneRef.current) {
        const micSource = audioContextRef.current.createMediaStreamSource(microphoneRef.current);
        micSource.connect(totalAnalyser);
      }
      if (systemAudioRef.current) {
        const systemSource = audioContextRef.current.createMediaStreamSource(systemAudioRef.current);
        systemSource.connect(totalAnalyser);
      }

      setAudioStatus(`正在监听 (${sourceCount}个音频源)...`);
      setIsListening(true);

      analyzeAudio();

    } catch (error) {
      console.error('启动监听失败:', error);
      setAudioStatus(`启动失败: ${error.message}`);
      setIsListening(false);
    }
  };

  const stopListening = () => {
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

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsListening(false);
    setAudioStatus('监听已停止');
    setVolumeLevel(0);
  };

  const analyzeAudio = () => {
    let hasMic = false;
    let hasSystem = false;
    let hasTotal = false;

    // 分析麦克风音量
    if (micAnalyserRef.current && micDataArrayRef.current) {
      micAnalyserRef.current.getByteFrequencyData(micDataArrayRef.current);
      let micSum = 0;
      for (let i = 0; i < micDataArrayRef.current.length; i++) {
        micSum += micDataArrayRef.current[i];
      }
      const micAverage = micSum / micDataArrayRef.current.length;
      const micVolume = Math.min(100, (micAverage / 255) * 100);
      setMicVolumeLevel(micVolume);
      hasMic = micVolume > 2;
    }

    // 分析系统音频音量
    if (systemAnalyserRef.current && systemDataArrayRef.current) {
      systemAnalyserRef.current.getByteFrequencyData(systemDataArrayRef.current);
      let systemSum = 0;
      for (let i = 0; i < systemDataArrayRef.current.length; i++) {
        systemSum += systemDataArrayRef.current[i];
      }
      const systemAverage = systemSum / systemDataArrayRef.current.length;
      const systemVolume = Math.min(100, (systemAverage / 255) * 100);
      setSystemVolumeLevel(systemVolume);
      hasSystem = systemVolume > 2;
    }

    // 分析总体音量（混合后的音频）
    if (totalAnalyserRef.current && totalDataArrayRef.current) {
      totalAnalyserRef.current.getByteFrequencyData(totalDataArrayRef.current);
      let totalSum = 0;
      for (let i = 0; i < totalDataArrayRef.current.length; i++) {
        totalSum += totalDataArrayRef.current[i];
      }
      const totalAverage = totalSum / totalDataArrayRef.current.length;
      const totalVolume = Math.min(100, (totalAverage / 255) * 100);
      setTotalVolumeLevel(totalVolume);
      hasTotal = totalVolume > 2;
    }

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
                      className={`p-4 rounded-lg border ${
                        defaultConfig?.id === config.id
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
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    ✓ 已保存配置
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
                    if (!checked) {
                      // 如果取消选择，禁用音频源（但保留设备配置）
                      if (speaker2Source && speaker2Source.device_id) {
                        await saveAudioSource('角色（系统音频）', speaker2Source.device_id, speaker2Source.device_name, false);
                      }
                    } else {
                      // 如果勾选，但还没有选择设备，提示用户选择设备
                      if (!selectedSystemAudioDevice && audioDevices.length > 0) {
                        setSelectedSystemAudioDevice(audioDevices[0].deviceId);
                        const device = audioDevices[0];
                        await saveAudioSource('角色（系统音频）', device.deviceId, device.label || device.deviceId, true);
                      } else if (speaker2Source && speaker2Source.device_id) {
                        // 如果之前有配置，恢复启用
                        await saveAudioSource('角色（系统音频）', speaker2Source.device_id, speaker2Source.device_name, true);
                      }
                    }
                  }}
                  className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
                />
                <label htmlFor="systemAudio" className="text-sm text-text-light dark:text-text-dark">
                  同时捕获系统音频（角色音频）*
                </label>
              </div>
              {captureSystemAudio && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
                      角色（系统音频）设备 *
                    </label>
                    <select
                      value={selectedSystemAudioDevice}
                      onChange={async (e) => {
                        const deviceId = e.target.value;
                        setSelectedSystemAudioDevice(deviceId);
                        const device = audioDevices.find(d => d.deviceId === deviceId);
                        if (device) {
                          await saveAudioSource('角色（系统音频）', deviceId, device.label || device.deviceId, true);
                        }
                      }}
                      className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {audioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `音频设备 ${device.deviceId.substring(0, 8)}`}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
                      选择虚拟音频设备（用于识别角色/游戏音频）
                    </p>
                    {speaker2Source && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        ✓ 已保存配置
                      </p>
                    )}
                  </div>

                  <div className="text-xs text-yellow-600 dark:text-yellow-400 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="font-medium mb-2 flex items-center gap-1">
                      <span>💡</span> 什么是虚拟音频设备？
                    </p>
                    <div className="space-y-2">
                      <p><strong>简单来说：</strong>虚拟音频设备是一个"假"的音频设备，让电脑以为有个真实的麦克风，但实际上这个麦克风接收到的是系统播放的声音。</p>
                      <div className="bg-white dark:bg-gray-800 p-2 rounded border border-yellow-200 dark:border-yellow-800">
                        <p className="font-medium mb-1">使用场景示例：</p>
                        <p>• 录制游戏时的背景音乐和音效</p>
                        <p>• 录制视频通话时对方的声音</p>
                        <p>• 同时录制麦克风说话声和电脑播放的音乐</p>
                      </div>
                      <div>
                        <p className="font-medium">安装步骤：</p>
                        <ul className="list-disc ml-5 mt-1 space-y-1">
                          <li><strong>Mac用户：</strong> 下载安装 BlackHole（免费软件）</li>
                          <li><strong>Windows用户：</strong> 下载安装 VB-Audio Virtual Cable（免费软件）</li>
                          <li><strong>步骤1：</strong> 安装后，打开系统设置 → 声音 → 输出，选择虚拟设备</li>
                          <li><strong>步骤2：</strong> 在本应用中选择虚拟设备作为麦克风</li>
                          <li><strong>步骤3：</strong> 现在应用就能"听到"电脑播放的所有声音了</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                        <span className="animate-pulse">⏹</span>
                        停止监听
                      </button>
                    )}
                  </div>

                  {isListening && (
                    <div className="space-y-3">
                      <div className="text-sm text-text-muted-light dark:text-text-muted-dark">
                        {audioStatus}
                      </div>

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

