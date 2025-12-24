import React from 'react';
import { TranscriptView } from './TranscriptView.jsx';
import { SuggestionsPanel } from './SuggestionsPanel.jsx';

export const FullHud = ({
    isListening,
    toggleListening,
    micVolumeLevel,
    systemVolumeLevel,
    systemAudioNotAuthorized,
    chatSession,
    messages,
    suggestions,
    onSwitchSession,
    onToggleViewMode,
    onClose
}) => {
    const micVolumePercent = Math.min(100, Math.max(0, Math.round((micVolumeLevel || 0) * 100)));
    const sysVolumePercent = Math.min(100, Math.max(0, Math.round((systemVolumeLevel || 0) * 100)));

    return (
        <div className="hud-container">
            <div className="hud-content">
                <header className="hud-header">
                    <div
                        className="hud-drag-zone"
                        title="拖拽HUD"
                    >
                        <span className="status-indicator" />
                        <div className="listening-badge" title="悬停查看双方实时音量">
                            <span className="listening-label">{isListening ? 'LISTENING' : 'PAUSED'}</span>
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
                        <span className="hud-title">{chatSession.sessionInfo?.characterName || '心情助手'}</span>
                    </div>
                    <div className="hud-controls">
                        <button
                            className={`control-btn ${isListening ? 'listening' : ''}`}
                            onClick={toggleListening}
                            title={isListening ? "停止监听" : "开始监听"}
                            style={{ color: isListening ? '#ff4d4f' : '#52c41a', marginRight: '8px' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {isListening ? (
                                    <rect x="6" y="4" width="4" height="16"></rect>
                                ) : (
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                )}
                                {isListening && <rect x="14" y="4" width="4" height="16"></rect>}
                            </svg>
                        </button>
                        <button className="control-btn" onClick={onSwitchSession} title="切换会话">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                                <path d="M21 3v5h-5"></path>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                <path d="M3 21v-5h5"></path>
                            </svg>
                        </button>
                        <button className="control-btn" onClick={onToggleViewMode} title="切换到精简模式">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="8" height="8"></rect>
                                <rect x="13" y="13" width="8" height="8"></rect>
                            </svg>
                        </button>
                        <button className="control-btn" onClick={onClose} aria-label="关闭 HUD">
                            ×
                        </button>
                    </div>
                </header>

                <section className="hud-section">
                    <div className="section-label">{chatSession.sessionInfo?.conversationName || '最近互动'}</div>
                    <TranscriptView
                        messages={messages.messages}
                        loading={messages.loading}
                        error={chatSession.error || messages.error}
                        isListening={isListening}
                        isNew={chatSession.sessionInfo?.isNew}
                        transcriptRef={messages.transcriptRef}
                    />
                </section>

                <SuggestionsPanel
                    suggestions={suggestions.suggestions}
                    suggestionMeta={suggestions.suggestionMeta}
                    suggestionStatus={suggestions.suggestionStatus}
                    suggestionError={suggestions.suggestionError}
                    PASSIVE_REASON_LABEL={suggestions.PASSIVE_REASON_LABEL}
                    copiedSuggestionId={suggestions.copiedSuggestionId}
                    onGenerate={suggestions.handleGenerateSuggestions}
                    onCopy={suggestions.handleCopySuggestion}
                    onSelectSuggestion={suggestions.handleSelectSuggestion}
                    suggestionConfig={suggestions.suggestionConfig}
                    onTogglePassive={(enabled) => suggestions.updateSuggestionConfig({ enable_passive_suggestion: enabled ? 1 : 0 })}
                    sessionInfo={chatSession.sessionInfo}
                />
            </div>
        </div>
    );
};
