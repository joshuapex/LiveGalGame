import React, { useMemo } from 'react';

const TAG_CLASSES = ['compact-tag-blue', 'compact-tag-red', 'compact-tag-purple'];

const normalizeVolume = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) return 0;
  if (value > 1) return Math.min(100, value);
  return Math.min(100, Math.max(0, Math.round(value * 100)));
};

export const CompactHud = ({
  isListening,
  micVolumeLevel,
  systemVolumeLevel,
  suggestions,
  suggestionMeta,
  suggestionStatus,
  suggestionError,
  copiedSuggestionId,
  onGenerate,
  onCopy,
  onToggleListening,
  onSwitchSession,
  onClose,
  onToggleViewMode,
  sessionInfo
}) => {
  const micVolumePercent = normalizeVolume(micVolumeLevel);
  const sysVolumePercent = normalizeVolume(systemVolumeLevel);

  const displaySuggestions = useMemo(() => {
    if (!Array.isArray(suggestions) || suggestions.length === 0) return [];
    return suggestions.slice(0, 3).map((s, index) => {
      const normalizedTags = Array.isArray(s.tags) ? s.tags.filter(Boolean) : [];
      return {
        ...s,
        tagClass: TAG_CLASSES[index % TAG_CLASSES.length],
        displayTags: normalizedTags.slice(0, 3),
        displayTitle: s.title || `建议 ${index + 1}`,
        displayContent: s.content || s.title || '暂无内容'
      };
    });
  }, [suggestions]);

  const listeningLabel = isListening ? 'LISTENING' : 'PAUSED';
  const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0;
  const modelName = suggestionMeta?.model || '—';

  return (
    <div className="compact-widget">
      <div className="compact-widget-inner">
        <div className="compact-header">
          <div className="compact-status-badge" title="悬停查看双方实时音量">
            <div className="status-text-layer">
              <div className={`compact-mini-wave ${isListening ? '' : 'paused'}`}>
                <div className="bar" />
                <div className="bar" />
                <div className="bar" />
              </div>
              {listeningLabel}
            </div>

            <div className="listening-popover">
              <div className="listening-row">
                <span className="listening-tag">ME</span>
                <div className="listening-bar">
                  <div className="listening-bar-fill mic" style={{ width: `${micVolumePercent}%` }} />
                </div>
                <span className="listening-value">{micVolumePercent}%</span>
              </div>
              <div className="listening-row">
                <span className="listening-tag">HER</span>
                <div className="listening-bar">
                  <div className="listening-bar-fill sys" style={{ width: `${sysVolumePercent}%` }} />
                </div>
                <span className="listening-value">{sysVolumePercent}%</span>
              </div>
            </div>
          </div>

          <div className="compact-window-controls">
            <button
              className="compact-ctrl-btn back-btn"
              title="切回完整HUD"
              onClick={onToggleViewMode}
            >
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
            </button>
            <button
              className={`compact-ctrl-btn record-btn ${isListening ? 'active' : ''}`}
              title={isListening ? '录音中 / 暂停' : '开始录音'}
              onClick={onToggleListening}
            >
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
            <button
              className="compact-ctrl-btn close-btn"
              title="关闭窗口"
              onClick={onClose}
            >
              <svg className="icon" viewBox="0 0 24 24">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>

        <div className="compact-widget-meta">
          <div className="compact-title">
            {sessionInfo?.characterName || '心情助手'}
            {sessionInfo?.conversationName ? (
              <span className="compact-subtitle"> · {sessionInfo.conversationName}</span>
            ) : null}
          </div>
          <div className="compact-meta-actions">
            <button className="refresh-btn compact-refresh" onClick={onToggleViewMode}>
              完整模式
            </button>
            <button className="refresh-btn compact-refresh" onClick={onSwitchSession}>
              切换会话
            </button>
          </div>
        </div>

        <div className="compact-widget-content">
          {suggestionError && (
            <div className="compact-error">{suggestionError}</div>
          )}
          {suggestionStatus === 'loading' && (
            <div className="compact-loading">正在生成候选回复…</div>
          )}
          {suggestionStatus === 'streaming' && suggestions.length === 0 && (
            <div className="compact-loading">流式生成中…</div>
          )}
          {suggestions.length === 0 && suggestionStatus !== 'loading' && suggestionStatus !== 'streaming' && (
            <div className="compact-loading">暂无建议，点击下方“生成建议”</div>
          )}
          <div className="compact-suggestion-list">
            {displaySuggestions.map((item, index) => (
              <div
                className="compact-suggestion-card"
                key={item.id || `compact-${index}`}
              >
                <div className="compact-tag-group">
                  {item.displayTags?.length
                    ? item.displayTags.map((tag, tagIdx) => (
                      <span
                        key={`${item.id || `compact-${index}`}-tag-${tagIdx}`}
                        className={`compact-tag ${TAG_CLASSES[tagIdx % TAG_CLASSES.length]}`}
                      >
                        {tag}
                      </span>
                    ))
                    : (
                      <span className={`compact-tag ${item.tagClass || TAG_CLASSES[index % TAG_CLASSES.length]}`}>
                        {item.displayTitle}
                      </span>
                    )}
                </div>
                <div className="compact-text">{item.displayContent}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="compact-widget-footer">
          <span className="compact-model-label">Model: {modelName}</span>
          <button
            className="refresh-btn"
            onClick={() => onGenerate({
              trigger: 'manual',
              reason: hasSuggestions ? 'refresh' : 'manual'
            })}
            disabled={suggestionStatus === 'loading' || suggestionStatus === 'streaming'}
          >
            {hasSuggestions ? '🔄 换一批' : '生成建议'}
          </button>
        </div>
      </div>
    </div>
  );
};

