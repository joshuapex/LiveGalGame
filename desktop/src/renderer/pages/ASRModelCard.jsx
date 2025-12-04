import { formatBytes, formatSpeed, calculateProgress, isPresetActive, engineNames } from './asrSettingsUtils';

export function ASRModelCard({
  preset,
  status = {},
  activeModelId,
  savingModelId,
  modelsLoading,
  onSetActive,
  onDownload,
  onCancelDownload,
}) {
  const totalBytes = status.totalBytes || status.sizeBytes || preset.sizeBytes || 0;
  const downloadedBytes = status.downloadedBytes || 0;
  const percent = calculateProgress(downloadedBytes, totalBytes);
  const isDownloaded = Boolean(status.isDownloaded);
  const activeDownload = Boolean(status.activeDownload);
  const isActive = isPresetActive(preset, activeModelId);
  const updatedAt = status.updatedAt ? new Date(status.updatedAt).toLocaleString() : null;
  const progressVisible = totalBytes > 0 && (activeDownload || (downloadedBytes > 0 && !isDownloaded));
  const engine = preset.engine || 'faster-whisper';

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-all ${
        isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900">{preset.label}</h3>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                engine === 'funasr' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {engineNames[engine] || engine}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{preset.description}</p>
          {preset.language && (
            <p className="mt-1 text-xs text-gray-500">
              语言: {preset.language === 'zh' ? '中文' : preset.language === 'multilingual' ? '多语言' : preset.language}
            </p>
          )}
        </div>
        {isActive && (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            当前使用
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        <p>推荐配置：{preset.recommendedSpec}</p>
        <p>速度参考：{preset.speedHint}</p>
        <p>模型大小：{formatBytes(preset.sizeBytes)}</p>
      </div>

      <div className="mt-4 text-sm">
        {isDownloaded ? (
          <div className="flex items-center text-green-600">
            <span className="material-symbols-outlined mr-1 text-sm">check_circle</span>
            <span>本地可用{updatedAt ? ` · 更新于 ${updatedAt}` : ''}</span>
          </div>
        ) : (
          <div className="text-gray-500">
            {activeDownload ? '正在下载模型...' : '尚未下载，点击下方按钮开始下载'}
          </div>
        )}
      </div>

      {progressVisible && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${isDownloaded ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
            <span>
              {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)} ({percent}%)
            </span>
            <span>速度：{formatSpeed(status.bytesPerSecond)}</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isDownloaded ? (
          <button
            onClick={() => onSetActive(preset.id)}
            disabled={isActive || savingModelId === preset.id}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              isActive ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
            } transition-colors`}
          >
            {isActive ? '当前已启用' : savingModelId === preset.id ? '应用中...' : '设为当前模型'}
          </button>
        ) : (
          <button
            onClick={() => onDownload(preset.id)}
            disabled={activeDownload || modelsLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {activeDownload ? '下载中...' : '下载模型'}
          </button>
        )}

        {activeDownload && (
          <button
            onClick={() => onCancelDownload(preset.id)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消下载
          </button>
        )}
      </div>
    </div>
  );
}


