export const ASR_MODEL_PRESETS = [
  {
    id: 'tiny',
    label: 'Whisper Tiny',
    description: '最快速，约 75MB，适合体验或低端设备，准确率较低',
    repoId: 'Systran/faster-whisper-tiny',
    modelScopeRepoId: 'gpustack/faster-whisper-tiny',
    sizeBytes: 76 * 1024 * 1024,
    recommendedSpec: '≥2 核 CPU / ≥2GB 内存',
    speedHint: '实时 4x+',
  },
  {
    id: 'base',
    label: 'Whisper Base',
    description: '速度与准确率均衡，约 150MB，默认推荐',
    repoId: 'Systran/faster-whisper-base',
    modelScopeRepoId: 'gpustack/faster-whisper-base',
    sizeBytes: 152 * 1024 * 1024,
    recommendedSpec: '≥4 核 CPU / ≥4GB 内存',
    speedHint: '实时 2x-3x',
  },
  {
    id: 'small',
    label: 'Whisper Small',
    description: '准确率更高，约 466MB，需要更高算力',
    repoId: 'Systran/faster-whisper-small',
    modelScopeRepoId: 'gpustack/faster-whisper-small',
    sizeBytes: 466 * 1024 * 1024,
    recommendedSpec: '≥6 核 CPU / ≥6GB 内存',
    speedHint: '实时 1x-2x',
  },
  {
    id: 'medium',
    label: 'Whisper Medium',
    description: '旗舰模型，约 1.4GB，中文表现最好但资源占用大',
    repoId: 'Systran/faster-whisper-medium',
    modelScopeRepoId: 'gpustack/faster-whisper-medium',
    sizeBytes: 1500 * 1024 * 1024,
    recommendedSpec: '≥8 核 CPU / ≥8GB 内存',
    speedHint: '接近实时',
  },
  {
    id: 'large-v2',
    label: 'Whisper Large v2',
    description: '多语言最高精度，约 2.9GB，运行成本高',
    repoId: 'Systran/faster-whisper-large-v2',
    modelScopeRepoId: 'gpustack/faster-whisper-large-v2',
    sizeBytes: 2950 * 1024 * 1024,
    recommendedSpec: '≥12 核 CPU / ≥12GB 内存',
    speedHint: '离线或高端主机',
  },
  {
    id: 'large-v3',
    label: 'Whisper Large v3',
    description: '最新大模型，约 3.1GB，更好上下文理解',
    repoId: 'Systran/faster-whisper-large-v3',
    modelScopeRepoId: 'gpustack/faster-whisper-large-v3',
    sizeBytes: 3100 * 1024 * 1024,
    recommendedSpec: '≥16 核 CPU / ≥16GB 内存',
    speedHint: '离线或服务器',
  },
];

export function getAsrModelPreset(modelId) {
  return ASR_MODEL_PRESETS.find((preset) => preset.id === modelId);
}

