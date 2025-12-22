/**
 * LLM配置表单组件
 */

import React from 'react';

export const LLMConfigForm = ({
  newConfig,
  onChange,
  onSubmit,
  onTest,
  onCancel,
  testingConfig,
  testConfigMessage,
  testConfigError,
  isEditing = false
}) => {
  return (
    <div className="p-4 rounded-lg border-2 border-dashed border-primary bg-primary/5">
      <h3 className="font-semibold text-text-light dark:text-text-dark mb-4">
        {isEditing ? '编辑配置' : '添加新配置'}
      </h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            配置名称
          </label>
          <input
            type="text"
            value={newConfig.name}
            onChange={(e) => onChange({ ...newConfig, name: e.target.value })}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="例如：OpenAI GPT-4"
          />
          <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
            仅用于显示和区分不同配置，可随意填写
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            API 密钥
          </label>
          <input
            type="password"
            value={newConfig.apiKey}
            onChange={(e) => onChange({ ...newConfig, apiKey: e.target.value })}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="sk-..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            模型名称
          </label>
          <input
            type="text"
            value={newConfig.modelName}
            onChange={(e) => onChange({ ...newConfig, modelName: e.target.value })}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="例如：gpt-4o-mini, claude-3-5-sonnet-20241022"
          />
          <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
            请填写 API 服务商提供的 Model ID（如 gpt-4o、claude-3-5-sonnet-20241022），留空将使用 gpt-4o-mini
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            Base URL（可选）
          </label>
          <input
            type="text"
            value={newConfig.baseUrl}
            onChange={(e) => onChange({ ...newConfig, baseUrl: e.target.value })}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            请求超时（毫秒，可选）
          </label>
          <input
            type="number"
            min="1000"
            step="1000"
            value={newConfig.timeoutMs}
            onChange={(e) => onChange({ ...newConfig, timeoutMs: e.target.value })}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="15000"
          />
          <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
            留空使用默认超时，建议不低于 1000ms
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isDefault"
            checked={newConfig.isDefault}
            onChange={(e) => onChange({ ...newConfig, isDefault: e.target.checked })}
            className="w-4 h-4 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
          />
          <label htmlFor="isDefault" className="text-sm text-text-light dark:text-text-dark">
            设为默认配置
          </label>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            保存配置
          </button>
          <button
            onClick={onTest}
            disabled={testingConfig}
            className="px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {testingConfig ? '测试中…' : '测试配置'}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-border-light dark:border-border-dark rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
          >
            取消
          </button>
        </div>
        {(testConfigMessage || testConfigError) && (
          <div className="pt-2 space-y-1 text-sm">
            {testConfigMessage && (
              <p className="text-green-600 dark:text-green-400">{testConfigMessage}</p>
            )}
            {testConfigError && (
              <p className="text-red-600 dark:text-red-400">{testConfigError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
