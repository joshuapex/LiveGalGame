/**
 * 音量指示器组件
 */

import React from 'react';

export const VolumeIndicators = ({
  micVolumeLevel,
  systemVolumeLevel,
  systemAudioNotAuthorized,
  sessionInfo
}) => {
  if (!sessionInfo) return null;

  return (
    <div className="volume-indicators">
      <div className="volume-item">
        <span className="volume-label">用户</span>
        <div className="volume-bar-container">
          <div
            className="volume-bar volume-bar-mic"
            style={{ width: `${micVolumeLevel}%` }}
          />
        </div>
        <span className="volume-value">{micVolumeLevel.toFixed(0)}%</span>
      </div>
      <div className="volume-item">
        <span className="volume-label">角色</span>
        <div className="volume-bar-container">
          <div
            className="volume-bar volume-bar-system"
            style={{ width: `${systemVolumeLevel}%` }}
          />
        </div>
        <span className="volume-value">{systemVolumeLevel.toFixed(0)}%</span>
        {systemAudioNotAuthorized && (
          <span className="volume-warning" title="系统音频未授权，请先在设置页面测试音频">⚠️</span>
        )}
      </div>
      {systemAudioNotAuthorized && (
        <div className="system-audio-hint">
          💡 系统音频未授权，请检查设置
        </div>
      )}
    </div>
  );
};