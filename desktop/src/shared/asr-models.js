export const ASR_MODEL_PRESETS = [
  // FunASR 模型（默认）- 使用 ModelScope 下载，国内访问更稳定
  // FunASR 通过 name_maps_ms 将简称映射到 ModelScope 仓库：
  //   paraformer-zh-streaming -> iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online
  //   paraformer-zh -> iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch
  //   ct-punc -> iic/punc_ct-transformer_cn-en-common-vocab471067-large
  //   fa-zh -> iic/speech_timestamp_prediction-v1-16k-offline
  {
    id: 'funasr-paraformer',
    label: 'FunASR ParaFormer',
    description: 'FunASR 流式识别，专为中文优化，标点准确，速度快',
    engine: 'funasr', // 指定使用 FunASR 引擎
    // FunASR 内部使用简称 "paraformer-zh-streaming"，自动从 ModelScope 下载
    repoId: 'paraformer-zh-streaming',
    // ModelScope 实际仓库 ID
    modelScopeRepoId: 'iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online',
    sizeBytes: 300 * 1024 * 1024,
    recommendedSpec: '≥4 核 CPU / ≥4GB 内存',
    speedHint: '实时 2x-3x',
    language: 'zh',
    isDefault: true,
  },
  {
    id: 'funasr-paraformer-large',
    label: 'FunASR ParaFormer Large',
    description: 'FunASR 大模型，更高准确率，专为中文设计',
    engine: 'funasr',
    // FunASR 内部使用简称 "paraformer-zh"，自动从 ModelScope 下载
    repoId: 'paraformer-zh',
    // ModelScope 实际仓库 ID
    modelScopeRepoId: 'iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch',
    sizeBytes: 500 * 1024 * 1024,
    recommendedSpec: '≥8 核 CPU / ≥8GB 内存',
    speedHint: '接近实时',
    language: 'zh',
  },

  // Faster-Whisper 模型
  {
    id: 'tiny',
    label: 'Whisper Tiny',
    description: '最快速，约 75MB，适合体验或低端设备，准确率较低',
    engine: 'faster-whisper', // 指定使用 Faster-Whisper 引擎
    repoId: 'Systran/faster-whisper-tiny',
    modelScopeRepoId: 'gpustack/faster-whisper-tiny',
    sizeBytes: 76 * 1024 * 1024,
    recommendedSpec: '≥2 核 CPU / ≥2GB 内存',
    speedHint: '实时 4x+',
    language: 'multilingual',
  },
  {
    id: 'base',
    label: 'Whisper Base',
    description: '速度与准确率均衡，约 150MB，适合多语言场景',
    engine: 'faster-whisper',
    repoId: 'Systran/faster-whisper-base',
    modelScopeRepoId: 'gpustack/faster-whisper-base',
    sizeBytes: 152 * 1024 * 1024,
    recommendedSpec: '≥4 核 CPU / ≥4GB 内存',
    speedHint: '实时 2x-3x',
    language: 'multilingual',
  },
  {
    id: 'small',
    label: 'Whisper Small',
    description: '准确率更高，约 466MB，需要更高算力',
    engine: 'faster-whisper',
    repoId: 'Systran/faster-whisper-small',
    modelScopeRepoId: 'gpustack/faster-whisper-small',
    sizeBytes: 466 * 1024 * 1024,
    recommendedSpec: '≥6 核 CPU / ≥6GB 内存',
    speedHint: '实时 1x-2x',
    language: 'multilingual',
  },
  {
    id: 'medium',
    label: 'Whisper Medium',
    description: '旗舰模型，约 1.4GB，中文表现较好但资源占用大',
    engine: 'faster-whisper',
    repoId: 'Systran/faster-whisper-medium',
    modelScopeRepoId: 'gpustack/faster-whisper-medium',
    sizeBytes: 1500 * 1024 * 1024,
    recommendedSpec: '≥8 核 CPU / ≥8GB 内存',
    speedHint: '接近实时',
    language: 'multilingual',
  },
  {
    id: 'large-v2',
    label: 'Whisper Large v2',
    description: '多语言最高精度，约 2.9GB，运行成本高',
    engine: 'faster-whisper',
    repoId: 'Systran/faster-whisper-large-v2',
    modelScopeRepoId: 'gpustack/faster-whisper-large-v2',
    sizeBytes: 2950 * 1024 * 1024,
    recommendedSpec: '≥12 核 CPU / ≥12GB 内存',
    speedHint: '离线或高端主机',
    language: 'multilingual',
  },
  {
    id: 'large-v3',
    label: 'Whisper Large v3',
    description: '最新大模型，约 3.1GB，更好上下文理解',
    engine: 'faster-whisper',
    repoId: 'Systran/faster-whisper-large-v3',
    modelScopeRepoId: 'gpustack/faster-whisper-large-v3',
    sizeBytes: 3100 * 1024 * 1024,
    recommendedSpec: '≥16 核 CPU / ≥16GB 内存',
    speedHint: '离线或服务器',
    language: 'multilingual',
  },
];

export function getAsrModelPreset(modelId) {
  return ASR_MODEL_PRESETS.find((preset) => preset.id === modelId);
}

