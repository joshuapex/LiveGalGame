import { useState, useCallback } from 'react';
import { isNonEmptyString, isValidApiKey, isValidBaseUrl, isValidModelName, isValidTimeoutMs } from '../utils/validation.js';

/**
 * LLM配置管理的自定义Hook
 */
export const useLLMConfig = () => {
  const [llmConfigs, setLlmConfigs] = useState([]);
  const [defaultConfig, setDefaultConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddConfig, setShowAddConfig] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState(null); // 正在编辑的配置ID
  const [featureBindings, setFeatureBindings] = useState({});
  const [featureBindingLoading, setFeatureBindingLoading] = useState(false);
  const [featureBindingError, setFeatureBindingError] = useState('');
  const [newConfig, setNewConfig] = useState({
    name: '',
    apiKey: '',
    baseUrl: '',
    modelName: 'gpt-4o-mini',
    timeoutMs: '',
    isDefault: false
  });
  const [testingConfig, setTestingConfig] = useState(false);
  const [testConfigMessage, setTestConfigMessage] = useState('');
  const [testConfigError, setTestConfigError] = useState('');

  /**
   * 加载所有LLM配置
   */
  const loadConfigs = useCallback(async () => {
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
  }, []);

  /**
   * 加载功能绑定配置
   */
  const loadFeatureBindings = useCallback(async () => {
    if (!window.electronAPI?.getLLMFeatureConfigs) {
      return;
    }
    try {
      setFeatureBindingLoading(true);
      setFeatureBindingError('');
      const bindings = await window.electronAPI.getLLMFeatureConfigs();
      setFeatureBindings(bindings || {});
    } catch (error) {
      console.error('Failed to load LLM feature configs:', error);
      setFeatureBindingError(error?.message || '加载功能绑定失败');
    } finally {
      setFeatureBindingLoading(false);
    }
  }, []);

  /**
   * 添加新配置
   */
  const handleAddConfig = useCallback(async () => {
    // 验证输入
    if (!isNonEmptyString(newConfig.name)) {
      alert('请填写配置名称');
      return;
    }
    if (!isValidApiKey(newConfig.apiKey)) {
      alert('请填写有效的API密钥');
      return;
    }
    if (!isValidModelName(newConfig.modelName)) {
      alert('请填写模型名称');
      return;
    }
    if (!isValidBaseUrl(newConfig.baseUrl)) {
      alert('请填写有效的Base URL');
      return;
    }
    if (!isValidTimeoutMs(newConfig.timeoutMs)) {
      alert('请填写有效的超时时间（毫秒）');
      return;
    }

    try {
      if (window.electronAPI?.saveLLMConfig) {
        const configData = {
          name: newConfig.name,
          api_key: newConfig.apiKey,
          base_url: newConfig.baseUrl || null,
          model_name: newConfig.modelName?.trim() || 'gpt-4o-mini',
          timeout_ms: newConfig.timeoutMs !== '' ? Number(newConfig.timeoutMs) : null,
          is_default: newConfig.isDefault
        };

        await window.electronAPI.saveLLMConfig(configData);

        // 重置表单
        setNewConfig({
          name: '',
          apiKey: '',
          baseUrl: '',
          modelName: 'gpt-4o-mini',
          timeoutMs: '',
          isDefault: false
        });
        setTestConfigMessage('');
        setTestConfigError('');
        setTestingConfig(false);
        setShowAddConfig(false);

        // 重新加载配置列表
        await loadConfigs();
      }
    } catch (error) {
      console.error('添加配置失败:', error);
      alert('添加配置失败，请重试');
    }
  }, [newConfig, loadConfigs]);

  /**
   * 测试LLM配置
   */
  const handleTestLLMConfig = useCallback(async () => {
    if (!window.electronAPI?.testLLMConnection) {
      setTestConfigError('LLM测试接口不可用');
      setTestConfigMessage('');
      return;
    }

    if (!isValidApiKey(newConfig.apiKey)) {
      setTestConfigError('请先填写有效的API密钥');
      setTestConfigMessage('');
      return;
    }
    if (!isValidTimeoutMs(newConfig.timeoutMs)) {
      setTestConfigError('请填写有效的超时时间（毫秒）');
      setTestConfigMessage('');
      return;
    }

    setTestingConfig(true);
    setTestConfigError('');
    setTestConfigMessage('');

    try {
      const result = await window.electronAPI.testLLMConnection({
        api_key: newConfig.apiKey,
        base_url: newConfig.baseUrl || null,
        model_name: newConfig.modelName?.trim() || 'gpt-4o-mini',
        timeout_ms: newConfig.timeoutMs !== '' ? Number(newConfig.timeoutMs) : null
      });

      if (result?.success) {
        const statusText = result?.status ? `（HTTP ${result.status}）` : '';
        setTestConfigMessage(`${result.message || '验证成功'}${statusText}`);
        setTestConfigError('');
      } else {
        const statusText = result?.status ? `（HTTP ${result.status}）` : '';
        setTestConfigError(`${result?.message || '验证失败，请检查 API Key 和 Base URL'}${statusText}`);
        setTestConfigMessage('');
      }
    } catch (error) {
      console.error('测试 LLM 配置失败:', error);
      setTestConfigError(error?.message || '测试失败，请稍后重试');
      setTestConfigMessage('');
    } finally {
      setTestingConfig(false);
    }
  }, [newConfig]);

  /**
   * 设置默认配置
   */
  const handleSetDefault = useCallback(async (configId) => {
    if (window.electronAPI?.setDefaultLLMConfig) {
      await window.electronAPI.setDefaultLLMConfig(configId);
      await loadConfigs();
    }
  }, [loadConfigs]);

  /**
   * 删除配置
   */
  const handleDeleteConfig = useCallback(async (configId) => {
    if (window.electronAPI?.deleteLLMConfig) {
      if (confirm('确定要删除这个配置吗？')) {
        await window.electronAPI.deleteLLMConfig(configId);
        await loadConfigs();
      }
    }
  }, [loadConfigs]);

  /**
   * 取消添加配置
   */
  const handleCancelAdd = useCallback(() => {
    setShowAddConfig(false);
    setEditingConfigId(null);
    setNewConfig({
      name: '',
      apiKey: '',
      baseUrl: '',
      modelName: 'gpt-4o-mini',
      timeoutMs: '',
      isDefault: false
    });
    setTestConfigMessage('');
    setTestConfigError('');
    setTestingConfig(false);
  }, []);

  /**
   * 开始编辑配置
   */
  const handleEditConfig = useCallback((config) => {
    setEditingConfigId(config.id);
    setNewConfig({
      name: config.name || '',
      apiKey: config.api_key || '',
      baseUrl: config.base_url || '',
      modelName: config.model_name || 'gpt-4o-mini',
      timeoutMs: config.timeout_ms ?? '',
      isDefault: config.is_default === 1
    });
    setShowAddConfig(true);
    setTestConfigMessage('');
    setTestConfigError('');
  }, []);

  /**
   * 保存配置（新增或更新）
   */
  const handleSaveConfig = useCallback(async () => {
    // 验证输入
    if (!isNonEmptyString(newConfig.name)) {
      alert('请填写配置名称');
      return;
    }
    if (!isValidApiKey(newConfig.apiKey)) {
      alert('请填写有效的API密钥');
      return;
    }
    if (!isValidModelName(newConfig.modelName)) {
      alert('请填写模型名称');
      return;
    }
    if (!isValidBaseUrl(newConfig.baseUrl)) {
      alert('请填写有效的Base URL');
      return;
    }
    if (!isValidTimeoutMs(newConfig.timeoutMs)) {
      alert('请填写有效的超时时间（毫秒）');
      return;
    }

    try {
      if (window.electronAPI?.saveLLMConfig) {
        const configData = {
          id: editingConfigId || undefined, // 如果有 id 则为更新
          name: newConfig.name,
          api_key: newConfig.apiKey,
          base_url: newConfig.baseUrl || null,
          model_name: newConfig.modelName?.trim() || 'gpt-4o-mini',
          timeout_ms: newConfig.timeoutMs !== '' ? Number(newConfig.timeoutMs) : null,
          is_default: newConfig.isDefault
        };

        await window.electronAPI.saveLLMConfig(configData);

        // 重置表单
        setNewConfig({
          name: '',
          apiKey: '',
          baseUrl: '',
          modelName: 'gpt-4o-mini',
          timeoutMs: '',
          isDefault: false
        });
        setTestConfigMessage('');
        setTestConfigError('');
        setTestingConfig(false);
        setShowAddConfig(false);
        setEditingConfigId(null);

        // 重新加载配置列表
        await loadConfigs();
      }
    } catch (error) {
      console.error('保存配置失败:', error);
      alert('保存配置失败，请重试');
    }
  }, [newConfig, editingConfigId, loadConfigs]);

  /**
   * 绑定/更新功能对应的 LLM 配置
   */
  const handleSetFeatureConfig = useCallback(
    async (feature, llmConfigId) => {
      if (!window.electronAPI?.setLLMFeatureConfig) {
        return;
      }
      try {
        setFeatureBindingLoading(true);
        setFeatureBindingError('');
        await window.electronAPI.setLLMFeatureConfig(feature, llmConfigId || null);
        await loadFeatureBindings();
      } catch (error) {
        console.error('设置功能绑定失败:', error);
        setFeatureBindingError(error?.message || '设置失败，请稍后重试');
      } finally {
        setFeatureBindingLoading(false);
      }
    },
    [loadFeatureBindings]
  );

  return {
    // 状态
    llmConfigs,
    defaultConfig,
    loading,
    showAddConfig,
    editingConfigId,
    featureBindings,
    featureBindingLoading,
    featureBindingError,
    newConfig,
    testingConfig,
    testConfigMessage,
    testConfigError,

    // 状态设置函数
    setShowAddConfig,
    setNewConfig,

    // 方法
    loadConfigs,
    loadFeatureBindings,
    handleAddConfig,
    handleSaveConfig,
    handleEditConfig,
    handleTestLLMConfig,
    handleSetDefault,
    handleDeleteConfig,
    handleCancelAdd,
    handleSetFeatureConfig
  };
};
