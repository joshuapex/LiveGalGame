export const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${SIZE_UNITS[exponent]}`;
}

export function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '—';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function buildStatusMap(statusList = []) {
  return statusList.reduce((acc, status) => {
    if (!status?.modelId) return acc;
    acc[status.modelId] = {
      bytesPerSecond: 0,
      ...status,
    };
    return acc;
  }, {});
}

export function calculateProgress(downloadedBytes, totalBytes) {
  if (!totalBytes || totalBytes <= 0) return 0;
  return Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
}

export function isPresetActive(preset, activeModelId) {
  if (!activeModelId) return false;
  return activeModelId === preset.id || activeModelId === preset.repoId;
}

export const engineNames = {
  funasr: 'FunASR',
  siliconflow: 'SiliconFlow（云端）',
};

export const languageOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日文' },
  { value: 'auto', label: '自动检测' },
];


