import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

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

  // 表单数据
  const [formData, setFormData] = useState({
    model_name: 'whisper-base',
    language: 'zh',
    enable_vad: true,
    sentence_pause_threshold: 1.0,
    retain_audio_files: false,
    audio_retention_days: 30,
    audio_storage_path: ''
  });

  // 可用模型选项
  const modelOptions = [
    { value: 'whisper-tiny', label: 'Whisper Tiny (~75MB)', description: '最小模型，适合低端设备，准确率一般' },
    { value: 'whisper-base', label: 'Whisper Base (~150MB)', description: '平衡模型，推荐用于大多数设备' },
    { value: 'whisper-small', label: 'Whisper Small (~500MB)', description: '较大模型，准确率更高，需要较好性能' }
  ];

  // 语言选项
  const languageOptions = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: '英文' },
    { value: 'ja', label: '日文' },
    { value: 'auto', label: '自动检测' }
  ];

  useEffect(() => {
    loadASRConfigs();
  }, []);

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
      model_name: 'whisper-base',
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
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ← 返回设置
          </Link>
        </div>
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
            + 添加配置
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
                      {config.is_default === 1 && (
                        <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          默认
                        </span>
                      )}
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
        <div className="mb-8 p-6 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">添加 ASR 配置</h3>

          <div className="grid gap-4 md:grid-cols-2">
            {/* 模型选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                模型 *
              </label>
              <select
                value={formData.model_name}
                onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                {modelOptions.find(m => m.value === formData.model_name)?.description}
              </p>
            </div>

            {/* 语言选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                识别语言 *
              </label>
              <select
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 停顿阈值 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                分句停顿阈值（秒）
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="5.0"
                value={formData.sentence_pause_threshold}
                onChange={(e) => setFormData({ ...formData, sentence_pause_threshold: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                检测到停顿超过此时间（秒）时进行分句
              </p>
            </div>

            {/* VAD 开关 */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="enable_vad"
                checked={formData.enable_vad}
                onChange={(e) => setFormData({ ...formData, enable_vad: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="enable_vad" className="ml-2 text-sm text-gray-700">
                启用语音活动检测（VAD）
              </label>
            </div>

            {/* 录音文件保留 */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="retain_audio_files"
                checked={formData.retain_audio_files}
                onChange={(e) => setFormData({ ...formData, retain_audio_files: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="retain_audio_files" className="ml-2 text-sm text-gray-700">
                保留录音文件
              </label>
            </div>

            {/* 保留天数 */}
            {formData.retain_audio_files && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  录音文件保留天数
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={formData.audio_retention_days}
                  onChange={(e) => setFormData({ ...formData, audio_retention_days: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* 存储路径 */}
            {formData.retain_audio_files && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  录音文件存储路径（可选）
                </label>
                <input
                  type="text"
                  placeholder="默认为: desktop/audio_recordings/"
                  value={formData.audio_storage_path}
                  onChange={(e) => setFormData({ ...formData, audio_storage_path: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  留空使用默认路径，或指定自定义路径
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={() => {
                setShowAddConfig(false);
                resetForm();
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreateConfig}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              创建配置
            </button>
          </div>
        </div>
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
