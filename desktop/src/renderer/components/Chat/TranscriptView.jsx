/**
 * 转录视图组件
 */

import React from 'react';

export const TranscriptView = ({
  messages,
  loading,
  error,
  isListening,
  isNew,
  transcriptRef
}) => {
  const renderContent = () => {
    if (loading) {
      return (
        <div className="hud-status">
          <span className="hud-spinner" aria-hidden="true" />
          <p className="hud-status-text">加载中...</p>
        </div>
      );
    }

    if (error) {
      // 检查是否是系统音频捕获失败的错误（不应该阻止应用运行）
      const isSystemAudioError = error.includes('系统音频捕获失败');

      return (
        <div className={`hud-status ${isSystemAudioError ? 'hud-warning' : 'hud-error'}`}>
          <p className="hud-status-text" style={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
            {isSystemAudioError ? '⚠️ ' : '❌ '}{error}
          </p>
        </div>
      );
    }

    if (!messages.length) {
      return (
        <div className="hud-status">
          <p className="hud-status-text">
            {isListening ? (isNew ? '新对话，开始聊天吧！' : '该对话还没有消息') : '点击上方播放按钮开始监听'}
          </p>
        </div>
      );
    }

    return (
      <>
        {messages.map((msg, index) => {
          const isUser = msg.sender === 'user';
          const key = msg.id ?? `${msg.sender}-${msg.timestamp ?? index}`;
          return (
            <div className={`message-item ${isUser ? 'message-user' : 'message-other'}`} key={key}>
              <div className="message-bubble">{msg.content || msg.text || ''}</div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="transcript-area" ref={transcriptRef}>
      {renderContent()}
    </div>
  );
};