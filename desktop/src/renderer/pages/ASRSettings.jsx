import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ASRModelCard } from './ASRModelCard';
import { ASRConfigForm } from './ASRConfigForm';
import {
  buildStatusMap,
  engineNames,
} from './asrSettingsUtils';

/**
 * ASR（语音识别）设置页面
 */
function ASRSettings() {
  // ASR 配置
  const [asrConfigs, setAsrConfigs] = useState([]);
  const [asrDefaultConfig, setAsrDefaultConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddConfig, setShowAddConfig] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);

  // ASR 模型（支持多引擎）
  const [modelPresets, setModelPresets] = useState([]);
  const [modelStatuses, setModelStatuses] = useState({});
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [activeModelId, setActiveModelId] = useState(null);
  const [savingModelId, setSavingModelId] = useState(null);
  const [downloadSource, setDownloadSource] = useState('huggingface');

  // 按引擎分组模型
  const modelsByEngine = modelPresets.reduce((acc, preset) => {
    const engine = preset.engine || 'faster-whisper';
    if (!acc[engine]) {
      acc[engine] = [];
    }
    acc[engine].push(preset);
    return acc;
  }, {});

  const engineNames = {
    'funasr': 'FunASR',
    'faster-whisper': 'Faster-Whisper'
  };

  // 表单数据
  const [formData, setFormData] = useState({
    model_name: 'medium',
    language: 'zh',
    enable_vad: true,
    sentence_pause_threshold: 1.0,
    retain_audio_files: false,
    audio_retention_days: 30,
    audio_storage_path: ''
  });

  useEffect(() => {
    loadASRConfigs();
    loadModelData();

    const api = window.electronAPI;
    if (!api) {
      return undefined;
    }

    const cleanups = [];

    if (api.onAsrModelDownloadStarted) {
      cleanups.push(api.onAsrModelDownloadStarted((payload) => {
        setModelStatuses((prev) => {
          const previous = prev[payload.modelId] || { modelId: payload.modelId };
          return {
            ...prev,
            [payload.modelId]: {
              ...previous,
              modelId: payload.modelId,
              activeDownload: true,
              bytesPerSecond: 0,
            },
          };
        });
      }));
    }

    if (api.onAsrModelDownloadProgress) {
      cleanups.push(api.onAsrModelDownloadProgress((payload) => {
        setModelStatuses((prev) => {
          const previous = prev[payload.modelId] || { modelId: payload.modelId };
          return {
            ...prev,
            [payload.modelId]: {
              ...previous,
              modelId: payload.modelId,
              downloadedBytes: payload.downloadedBytes ?? previous.downloadedBytes ?? 0,
              totalBytes: payload.totalBytes ?? previous.totalBytes ?? previous.sizeBytes ?? 0,
              bytesPerSecond: payload.bytesPerSecond ?? previous.bytesPerSecond ?? 0,
              activeDownload: true,
              isDownloaded: false,
            },
          };
        });
      }));
    }

    if (api.onAsrModelDownloadComplete) {
      cleanups.push(api.onAsrModelDownloadComplete((payload) => {
        const status = payload.status || {};
        setModelStatuses((prev) => ({
          ...prev,
          [payload.modelId]: {
            ...(status.modelId ? status : { ...status, modelId: payload.modelId }),
            bytesPerSecond: 0,
            activeDownload: false,
          },
        }));
      }));
    }

    if (api.onAsrModelDownloadError) {
      cleanups.push(api.onAsrModelDownloadError((payload) => {
        setModelStatuses((prev) => {
          const previous = prev[payload.modelId] || { modelId: payload.modelId };
          return {
            ...prev,
            [payload.modelId]: {
              ...previous,
              modelId: payload.modelId,
              activeDownload: false,
            },
          };
        });
      }));
    }

    if (api.onAsrModelDownloadCancelled) {
      cleanups.push(api.onAsrModelDownloadCancelled((payload) => {
        setModelStatuses((prev) => {
          const previous = prev[payload.modelId] || { modelId: payload.modelId };
          return {
            ...prev,
            [payload.modelId]: {
              ...previous,
              modelId: payload.modelId,
              activeDownload: false,
            },
          };
        });
      }));
    }

    return () => {
      cleanups.forEach((cleanup) => {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      });
    };
  }, []);

  const loadModelData = async () => {
    try {
      setModelsError('');
      setModelsLoading(true);
      const api = window.electronAPI;
      if (!api?.asrGetModelPresets) {
        throw new Error('ASR 模型接口不可用');
      }

      const presets = await api.asrGetModelPresets();
      const statuses = await api.asrGetAllModelStatuses();

      setModelPresets(presets || []);
      setModelStatuses(buildStatusMap(statuses || []));
    } catch (err) {
      console.error('加载模型数据失败：', err);
      setModelsError(err.message || '加载模型数据失败');
    } finally {
      setModelsLoading(false);
    }
  };

  const handleDownloadModel = async (modelId) => {
    try {
      const api = window.electronAPI;
      if (!api?.asrDownloadModel) {
        throw new Error('下载接口不可用');
      }
      await api.asrDownloadModel(modelId, downloadSource);
    } catch (err) {
      console.error('下载模型失败：', err);
      alert('下载模型失败：' + (err.message || '未知错误'));
    }
  };

  const handleCancelDownload = async (modelId) => {
    try {
      const api = window.electronAPI;
      if (!api?.asrCancelModelDownload) {
        throw new Error('取消下载接口不可用');
      }
      await api.asrCancelModelDownload(modelId);
    } catch (err) {
      console.error('取消下载失败：', err);
      alert('取消下载失败：' + (err.message || '未知错误'));
    }
  };

  const handleSetActiveModel = async (modelId) => {
    try {
      if (!asrDefaultConfig) {
        alert('请先创建并设置一个默认的 ASR 配置');
        return;
      }
      const api = window.electronAPI;
      if (!api?.asrUpdateConfig) {
        throw new Error('ASR 配置接口不可用');
      }
      setSavingModelId(modelId);
      await api.asrUpdateConfig(asrDefaultConfig.id, { model_name: modelId });
      await loadASRConfigs();
      setActiveModelId(modelId);
      api.asrReloadModel()
        .then(() => {
          alert('ASR 模型切换成功，后台已重新加载新模型，将在后续识别中生效。');
        })
        .catch((error) => {
          console.error('重新加载 ASR 模型失败：', error);
          alert('重新加载 ASR 模型失败：' + (error.message || '未知错误'));
        });
    } catch (err) {
      console.error('设置默认模型失败：', err);
      alert('设置默认模型失败：' + (err.message || '未知错误'));
    } finally {
      setSavingModelId(null);
    }
  };

  useEffect(() => {
    if (modelPresets.length === 0) {
      return;
    }
    setFormData((prev) => {
      if (modelPresets.some((preset) => preset.id === prev.model_name)) {
        return prev;
      }
      return {
        ...prev,
        model_name: modelPresets[0].id,
      };
    });
  }, [modelPresets]);

  // 加载 ASR 配置
  const loadASRConfigs = async () => {
    try {
      setLoading(true);
      const api = window.electronAPI;
      if (!api?.asrGetConfigs) {
        throw new Error('ASR API 不可用');
      }

      const configs = await api.asrGetConfigs();
      setAsrConfigs(configs || []);

      // 查找默认配置
      const defaultConfig = configs?.find(config => config.is_default === 1);
      setAsrDefaultConfig(defaultConfig || null);
      const activeModel = defaultConfig?.model_name || configs?.[0]?.model_name || null;
      setActiveModelId(activeModel || null);

      console.log('ASR configs loaded:', configs);
    } catch (err) {
      console.error('加载 ASR 配置失败：', err);
      alert('加载 ASR 配置失败：' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 创建 ASR 配置
  const handleCreateConfig = async () => {
    try {
      const api = window.electronAPI;
      if (!api?.asrCreateConfig) {
        throw new Error('ASR API 不可用');
      }

      // 验证数据
      if (!formData.model_name) {
        alert('请选择模型');
        return;
      }

      const config = await api.asrCreateConfig({
        ...formData,
        enable_vad: formData.enable_vad ? 1 : 0,
        retain_audio_files: formData.retain_audio_files ? 1 : 0,
        sentence_pause_threshold: parseFloat(formData.sentence_pause_threshold) || 1.0,
        audio_retention_days: parseInt(formData.audio_retention_days) || 30
      });

      if (config) {
        alert('ASR 配置创建成功！');
        setShowAddConfig(false);
        resetForm();
        await loadASRConfigs();
      }
    } catch (err) {
      console.error('创建 ASR 配置失败：', err);
      alert('创建 ASR 配置失败：' + (err.message || '未知错误'));
    }
  };

  // 设置默认配置
  const handleSetDefault = async (configId) => {
    try {
      const api = window.electronAPI;
      if (!api?.asrSetDefaultConfig) {
        throw new Error('ASR API 不可用');
      }

      const success = await api.asrSetDefaultConfig(configId);
      if (success) {
        alert('已设置为默认配置');
        await loadASRConfigs();
      }
    } catch (err) {
      console.error('设置默认配置失败：', err);
      alert('设置默认配置失败：' + (err.message || '未知错误'));
    }
  };

  // 删除配置
  const handleDeleteConfig = async (configId) => {
    if (!confirm('确定要删除这个配置吗？此操作不可恢复。')) {
      return;
    }

    try {
      const api = window.electronAPI;
      if (!api?.deleteLLMConfig) {
        // TODO: 实现删除 ASR 配置的方法
        alert('删除功能暂未实现');
        return;
      }

      // await api.deleteASRConfig(configId);
      alert('配置已删除（模拟）');
      await loadASRConfigs();
    } catch (err) {
      console.error('删除配置失败：', err);
      alert('删除配置失败：' + (err.message || '未知错误'));
    }
  };

  // 重置表单
  const resetForm = () => {
    setFormData({
      model_name: modelPresets[0]?.id || 'medium',
      language: 'zh',
      enable_vad: true,
      sentence_pause_threshold: 1.0,
      retain_audio_files: false,
      audio_retention_days: 30,
      audio_storage_path: ''
    });
  };

  // 测试 ASR 功能
  const testASR = async () => {
    alert('ASR 测试功能：系统将使用当前默认配置进行语音识别测试。\n\n请确保：\n1. 已选择正确的音频输入设备\n2. 麦克风权限已授权\n3. 环境相对安静');
  };

  const selectedModelPreset = modelPresets.find((preset) => preset.id === formData.model_name);

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">ASR 语音识别设置</h1>
            <p className="text-gray-600">配置语音识别模型、音频设备和录音选项</p>
          </div>
          <Link
            to="/settings"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            返回设置
          </Link>
        </div>
      </div>

      {/* 模型管理 */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">ASR 模型管理</h2>
            <p className="text-sm text-gray-600 mt-1">
              选择适合设备性能的模型，查看本地缓存状态，并监控下载速度
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setDownloadSource('huggingface')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${downloadSource === 'huggingface'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                HuggingFace
              </button>
              <button
                onClick={() => setDownloadSource('modelscope')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${downloadSource === 'modelscope'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                ModelScope (国内推荐)
              </button>
            </div>
            <button
              onClick={loadModelData}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              刷新状态
            </button>
          </div>
        </div>

        {modelsError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {modelsError}
          </div>
        )}

        {modelsLoading ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-2xl border border-gray-200 bg-gray-100"
              />
            ))}
          </div>
        ) : modelPresets.length === 0 ? (
          <div className="mt-6 rounded-lg border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
            暂无可用的 ASR 模型预设
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {Object.entries(modelsByEngine).map(([engine, presets]) => (
              <div key={engine} className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {engineNames[engine] || engine}
                  </h3>
                </div>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {presets.map((preset) => (
                    <ASRModelCard
                      key={preset.id}
                      preset={preset}
                      status={modelStatuses[preset.id] || {}}
                      activeModelId={activeModelId}
                      savingModelId={savingModelId}
                      modelsLoading={modelsLoading}
                      onSetActive={handleSetActiveModel}
                      onDownload={handleDownloadModel}
                      onCancelDownload={handleCancelDownload}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 默认配置信息 */}
      {asrDefaultConfig && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                当前默认配置: {asrDefaultConfig.model_name}
              </h3>
              <div className="mt-1 text-sm text-blue-700">
                <p>语言: {asrDefaultConfig.language === 'zh' ? '中文' : asrDefaultConfig.language}</p>
                <p>VAD: {asrDefaultConfig.enable_vad ? '已启用' : '已禁用'}</p>
                {asrDefaultConfig.retain_audio_files && (
                  <p>录音保留: {asrDefaultConfig.audio_retention_days} 天</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 配置列表 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">ASR 配置列表</h2>
          <button
            onClick={() => setShowAddConfig(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            添加配置
          </button>
        </div>

        {asrConfigs.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">暂无 ASR 配置</h3>
            <p className="mt-1 text-sm text-gray-500">点击上方按钮添加第一个配置</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {asrConfigs.map((config) => (
              <div key={config.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <h3 className="text-lg font-medium text-gray-900">
                        {config.model_name}
                      </h3>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      <p>语言: {config.language === 'zh' ? '中文' : config.language}</p>
                      <p>VAD: {config.enable_vad ? '已启用' : '已禁用'}</p>
                      <p>停顿阈值: {config.sentence_pause_threshold} 秒</p>
                      {config.retain_audio_files ? (
                        <p className="text-green-600">录音保留: {config.audio_retention_days} 天</p>
                      ) : (
                        <p className="text-gray-500">不保留录音</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {config.is_default !== 1 && (
                      <button
                        onClick={() => handleSetDefault(config.id)}
                        className="px-3 py-1 text-sm text-blue-600 border border-blue-600 rounded hover:bg-blue-50 transition-colors"
                      >
                        设为默认
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteConfig(config.id)}
                      className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded hover:bg-red-50 transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加配置表单 */}
      {showAddConfig && (
        <ASRConfigForm
          formData={formData}
          setFormData={setFormData}
          modelPresets={modelPresets}
          selectedModelPreset={selectedModelPreset}
          onCreate={handleCreateConfig}
          onCancel={() => {
            setShowAddConfig(false);
            resetForm();
          }}
        />
      )}

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={testASR}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
        >
          🎤 测试语音识别
        </button>
        <button
          onClick={loadASRConfigs}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          🔄 刷新配置
        </button>
      </div>

      {/* 说明信息 */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-900 mb-2">💡 使用说明</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• 模型大小影响识别准确率和性能，请根据设备性能选择</li>
          <li>• VAD（语音活动检测）可提高识别准确性，建议开启</li>
          <li>• 录音文件可用于回放和质量分析，但会占用存储空间</li>
          <li>• 在 HUD 界面中点击"开始识别"按钮启动语音识别</li>
          <li>• 识别结果会自动保存到当前对话中</li>
        </ul>
      </div>
    </div>
  );
}

export default ASRSettings;
