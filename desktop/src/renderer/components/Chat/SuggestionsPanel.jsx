/**
 * 建议面板组件
 */

import React from 'react';

export const SuggestionsPanel = ({
  suggestions,
  suggestionMeta,
  suggestionStatus,
  suggestionError,
  PASSIVE_REASON_LABEL,
  copiedSuggestionId,
  onGenerate,
  onCopy,
  sessionInfo
}) => {
  const isStreaming = suggestionStatus === 'streaming';
  const expectedCount = suggestionMeta?.expectedCount || null;
  const generatedCount = suggestions.length;

  return (
    <section className="hud-section">
      <div className="section-label suggestion-header">
        <span>AI 建议</span>
        <div className="suggestion-actions">
          {suggestionMeta?.reason && (
            <span className="suggestion-badge suggestion-trigger">
              {PASSIVE_REASON_LABEL[suggestionMeta.reason] || '自动触发'}
            </span>
          )}
          {isStreaming && (
            <span className="suggestion-badge suggestion-trigger">
              实时生成 {generatedCount}
              {expectedCount ? `/${expectedCount}` : ''}
            </span>
          )}
          <button
            className="suggestion-action-btn"
            onClick={() => onGenerate({ trigger: 'manual', reason: 'manual' })}
            disabled={
              suggestionStatus === 'loading' ||
              suggestionStatus === 'streaming' ||
              !sessionInfo?.conversationId
            }
            title="基于最新对话生成候选回复方向"
          >
            {suggestionStatus === 'loading' || isStreaming ? '生成中…' : '生成建议'}
          </button>
        </div>
      </div>
      {suggestionError && (
        <div className="hud-status hud-warning">
          <p className="hud-status-text">{suggestionError}</p>
        </div>
      )}
      <div className="suggestions-grid">
        {suggestionStatus === 'loading' && (
          <div className="hud-status">
            <span className="hud-spinner" aria-hidden="true" />
            <p className="hud-status-text">正在生成个性化建议…</p>
          </div>
        )}
        {isStreaming && generatedCount === 0 && (
          <div className="hud-status">
            <span className="hud-spinner" aria-hidden="true" />
            <p className="hud-status-text">正在流式生成，请稍候…</p>
          </div>
        )}
        {!isStreaming && suggestionStatus !== 'loading' && suggestions.length === 0 && (
          <div className="hud-status">
            <p className="hud-status-text">
              暂无建议，点击上方按钮或等待系统自动推荐
            </p>
          </div>
        )}
        {suggestions.map((suggestion) => {
          const showCombined =
            !suggestion.content || suggestion.title === suggestion.content;
          const mainText = suggestion.content || suggestion.title;
          return (
            <article className="suggestion-card" key={suggestion.id}>
              {showCombined ? (
                <p className="suggestion-body">{mainText}</p>
              ) : (
                <>
                  <div className="suggestion-header">
                    <strong>{suggestion.title}</strong>
                    {suggestion.tags?.length > 0 && (
                      <div className="suggestion-meta">
                        {suggestion.tags.map((tag) => (
                          <span className="suggestion-badge" key={`${suggestion.id}-${tag}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="suggestion-body">{suggestion.content}</p>
                </>
              )}
              {showCombined && suggestion.tags?.length > 0 && (
                <div className="suggestion-meta">
                  {suggestion.tags.map((tag) => (
                    <span className="suggestion-badge" key={`${suggestion.id}-${tag}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
        {isStreaming && generatedCount > 0 && (!expectedCount || generatedCount < expectedCount) && (
          <div className="hud-status">
            <span className="hud-spinner" aria-hidden="true" />
            <p className="hud-status-text">继续生成中…</p>
          </div>
        )}
      </div>
    </section>
  );
};