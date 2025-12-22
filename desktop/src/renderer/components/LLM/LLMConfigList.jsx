/**
 * LLM配置列表组件
 */

import React from 'react';

export const LLMConfigList = ({
  configs,
  defaultConfig,
  onSetDefault,
  onEdit,
  onDelete,
  loading
}) => {
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-text-muted-light dark:text-text-muted-dark">加载中...</p>
      </div>
    );
  }

  if (!configs || configs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted-light dark:text-text-muted-dark">暂无LLM配置</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {configs.map((config) => (
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
                  <span className="ml-2 text-xs bg-primary text-white px-2 py-1 rounded">默认</span>
                )}
              </h3>
              <div className="text-sm text-text-muted-light dark:text-text-muted-dark mt-1 space-y-1">
                <p>模型：{config.model_name || '未配置'}</p>
                {config.base_url ? <p>Base URL：{config.base_url}</p> : null}
                {config.timeout_ms ? <p>超时：{config.timeout_ms} ms</p> : null}
              </div>
            </div>
            <div className="flex gap-2">
              {defaultConfig?.id !== config.id && (
                <button
                  onClick={() => onSetDefault(config.id)}
                  className="px-3 py-1 text-sm border border-border-light dark:border-border-dark rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                >
                  设为默认
                </button>
              )}
              <button
                onClick={() => onEdit(config)}
                className="px-3 py-1 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
              >
                编辑
              </button>
              <button
                onClick={() => onDelete(config.id)}
                className="px-3 py-1 text-sm text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
