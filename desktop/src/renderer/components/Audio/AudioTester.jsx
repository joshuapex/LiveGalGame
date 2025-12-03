/**
 * 音频测试组件
 */

import React from 'react';

export const AudioTester = ({
  isListening,
  audioStatus,
  desktopCapturerError,
  micVolumeLevel,
  systemVolumeLevel,
  totalVolumeLevel,
  onStart,
  onStop,
  captureSystemAudio
}) => {
  return (
    <div className="border-t border-border-light dark:border-border-dark pt-4">
      <h3 className="text-sm font-medium text-text-light dark:text-text-dark mb-3">
        测试麦克风监听
      </h3>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {!isListening ? (
            <button
              onClick={onStart}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">mic</span>
              开始监听
            </button>
          ) : (
            <button
              onClick={onStop}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined animate-pulse">stop_circle</span>
              停止监听
            </button>
          )}
        </div>

        {isListening && (
          <div className="space-y-3">
            <div className={`text-sm font-medium flex items-center gap-2 ${audioStatus.includes('✅') || audioStatus.includes('成功') ? 'text-green-600 dark:text-green-400' :
                audioStatus.includes('⚠️') || audioStatus.includes('❌') || audioStatus.includes('失败') || audioStatus.includes('错误') ? 'text-red-600 dark:text-red-400' :
                  'text-text-muted-light dark:text-text-muted-dark'
              }`}>
              {audioStatus.includes('✅') || audioStatus.includes('成功') ? (
                <span className="material-symbols-outlined text-sm">check_circle</span>
              ) : audioStatus.includes('⚠️') || audioStatus.includes('❌') || audioStatus.includes('失败') || audioStatus.includes('错误') ? (
                <span className="material-symbols-outlined text-sm">error</span>
              ) : (
                <span className="material-symbols-outlined text-sm">mic</span>
              )}
              {audioStatus.replace(/[✅⚠️❌]/g, '').trim()}
            </div>

            {desktopCapturerError && (
              <div className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 p-2 rounded border border-orange-200 dark:border-orange-800">
                <p className="font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  原生屏幕音频捕获失败
                </p>
                <p className="mt-1 opacity-90">{desktopCapturerError}</p>
                <p className="mt-1 opacity-80 border-t border-orange-200 dark:border-orange-800 pt-1">
                  自动捕获系统音频失败。请检查系统权限或驱动。
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-16">麦克风</span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-100"
                    style={{ width: `${micVolumeLevel}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-10">
                  {micVolumeLevel.toFixed(0)}%
                </span>
              </div>

              {captureSystemAudio && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-16">系统音频</span>
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all duration-100"
                      style={{ width: `${systemVolumeLevel}%` }}
                    />
                  </div>
                  <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-10">
                    {systemVolumeLevel.toFixed(0)}%
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-1 border-t border-gray-200 dark:border-gray-700">
                <span className="text-xs font-medium text-text-light dark:text-text-dark w-16">总音量</span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-100"
                    style={{ width: `${totalVolumeLevel}%` }}
                  />
                </div>
                <span className="text-xs text-text-muted-light dark:text-text-muted-dark w-10">
                  {totalVolumeLevel.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};