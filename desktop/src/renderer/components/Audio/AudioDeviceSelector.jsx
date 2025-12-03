/**
 * 音频设备选择组件
 */

import React from 'react';

export const AudioDeviceSelector = ({
  audioDevices,
  selectedAudioDevice,
  onDeviceChange,
  captureSystemAudio,
  onSystemAudioToggle,
  speaker1Source,
  speaker2Source
}) => {
  if (audioDevices.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted-light dark:text-text-muted-dark mb-4">
          未检测到音频输入设备
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
          用户（麦克风）设备 *
        </label>
        <select
          value={selectedAudioDevice}
          onChange={(e) => onDeviceChange(e.target.value)}
          className="w-full px-3 py-2 border border-border-light dark:border-border-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {audioDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `麦克风 ${device.deviceId.substring(0, 8)}`}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
          选择要使用的麦克风设备（用于识别用户说话）
        </p>
        {speaker1Source && (
          <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            已保存配置
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="systemAudio"
          checked={captureSystemAudio}
          onChange={(e) => onSystemAudioToggle(e.target.checked)}
          className="rounded border-border-light dark:border-border-dark text-primary focus:ring-primary"
        />
        <label htmlFor="systemAudio" className="text-sm font-medium text-text-light dark:text-text-dark">
          同时捕获系统音频（角色音频）
        </label>
      </div>
    </div>
  );
};