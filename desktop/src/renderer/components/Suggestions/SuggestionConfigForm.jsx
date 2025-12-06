/**
 * 建议配置表单组件
 */

import React from 'react';

export const SuggestionConfigForm = ({
  form,
  onUpdateField,
  onNumberChange,
  onSave,
  loading,
  saving,
  message,
  error
}) => {
  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border border-border-light dark:border-border-dark">
        <div>
          <p className="font-medium text-text-light dark:text-text-dark">被动推荐</p>
          <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
            达到阈值时自动生成候选方向（静默、连续消息或话题转折）。
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-text-muted-light dark:text-text-muted-dark">
            {form.enable_passive_suggestion ? '已启用' : '已关闭'}
          </span>
          <input
            type="checkbox"
            checked={form.enable_passive_suggestion}
            onChange={(e) => onUpdateField('enable_passive_suggestion', e.target.checked)}
            className="w-5 h-5 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
            每次生成选项数量
          </label>
          <input
            type="number"
            min={2}
            max={5}
            value={form.suggestion_count ?? ''}
            onChange={onNumberChange('suggestion_count')}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
            建议 2-5 个之间，避免信息过载。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
            上下文消息数量
          </label>
          <input
            type="number"
            min={4}
            max={20}
            value={form.context_message_limit ?? ''}
            onChange={onNumberChange('context_message_limit')}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
            仅截取最近 N 条历史，控制调用成本。
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
            静默触发阈值（秒）
          </label>
          <input
            type="number"
            min={1}
            max={15}
            value={form.silence_threshold_seconds ?? ''}
            onChange={onNumberChange('silence_threshold_seconds')}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
            连续消息阈值（条）
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={form.message_threshold_count ?? ''}
            onChange={onNumberChange('message_threshold_count')}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
            被动触发冷却（秒）
          </label>
          <input
            type="number"
            min={5}
            max={300}
            value={form.cooldown_seconds ?? ''}
            onChange={onNumberChange('cooldown_seconds')}
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
            防止建议过于频繁的等待时间。达到触发条件后，需等待此时间才会再次生成建议。
          </p>
        </div>
      </div>

      <div className="p-4 rounded-lg border border-border-light dark:border-border-dark flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-text-light dark:text-text-dark">场景判断 LLM（situation_llm）</p>
          <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
            将实时对话片段交给专用模型，判断是否需要唤起选项生成；比通用模型更便宜、更快。
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-text-muted-light dark:text-text-muted-dark">
            {form.situation_llm_enabled ? '已启用' : '已关闭'}
          </span>
          <input
            type="checkbox"
            checked={form.situation_llm_enabled}
            onChange={(e) => {
              onUpdateField('situation_llm_enabled', e.target.checked);
              onUpdateField('topic_detection_enabled', e.target.checked);
            }}
            className="w-5 h-5 text-primary border-border-light dark:border-border-dark rounded focus:ring-primary"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
            场景判断模型名称
          </label>
          <input
            type="text"
            value={form.situation_model_name || ''}
            onChange={(e) => onUpdateField('situation_model_name', e.target.value)}
            placeholder="gpt-4o-mini"
            className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
            仅用于判定“是否需要生成选项”，默认沿用全局模型；可填廉价/快速的模型名。
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {message && (
          <span className="text-sm text-green-600 dark:text-green-400">{message}</span>
        )}
        <button
          onClick={onSave}
          disabled={saving || loading}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  );
};
