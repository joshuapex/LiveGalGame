export const ASR_MODEL_PRESETS = [
  // SiliconFlow 云端模型（默认）
  {
    id: 'siliconflow-cloud',
    label: 'SiliconFlow Cloud (推荐)',
    description: '远程 API 模式，无需本地下载模型，轻量级，但需要联网。',
    engine: 'siliconflow',
    sizeBytes: 0,
    recommendedSpec: '任意配置',
    speedHint: '网络延迟',
    language: 'zh',
    isDefault: true,
    isRemote: true,
  },
  // 百度实时 ASR (Demo)
  {
    id: 'baidu-cloud',
    label: 'Baidu Cloud (Demo)',
    description: '百度语音实时识别 API，低延迟，高精度，需联网。',
    engine: 'baidu',
    sizeBytes: 0,
    recommendedSpec: '任意配置',
    speedHint: '网络延迟',
    language: 'zh',
    isRemote: true,
  },
  // FunASR ONNX 模型
  // 2-Pass 架构: VAD + 流式ASR + 离线ASR + 标点
  {
    id: 'funasr-paraformer',
    label: 'FunASR ParaFormer',
    description: 'FunASR 流式识别，INT8 量化版，体积更小、速度更快，精度略低',
    engine: 'funasr',
    // ONNX 模型配置 (用于 2-Pass 架构)
    onnxModels: {
      vad: 'damo/speech_fsmn_vad_zh-cn-16k-common-onnx',
      online: 'damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx',
      offline: 'damo/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-onnx',
      punc: 'damo/punc_ct-transformer_zh-cn-common-vocab272727-onnx',
    },
    // 用于缓存路径检测 (兼容 model-manager.js)
    repoId: 'damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx',
    modelScopeRepoId: 'iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online',
    // 本地统计（ModelScope 缓存）: online quant ~240MB + offline quant ~247MB + punc ~274MB + VAD ~1MB ≈ 760MB
    sizeBytes: 760 * 1024 * 1024, // 约 0.76GB（INT8 量化包体，含 VAD/流式/离线/标点）
    recommendedSpec: '≥4 核 CPU / ≥4GB 内存',
    speedHint: '实时 2x-3x',
    language: 'zh',
  },
  {
    id: 'funasr-paraformer-large',
    label: 'FunASR ParaFormer Large',
    description: 'FunASR 非量化 FP32 版，精度最高但体积更大、占用更高',
    engine: 'funasr',
    // ONNX 模型配置 - 使用更大的离线模型
    onnxModels: {
      vad: 'damo/speech_fsmn_vad_zh-cn-16k-common-onnx',
      online: 'damo/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online-onnx',
      // Large 版本使用非量化模型，精度更高
      offline: 'damo/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-onnx',
      punc: 'damo/punc_ct-transformer_zh-cn-common-vocab272727-onnx',
    },
    quantize: false, // Large 版本不使用量化，精度更高
    // 用于缓存路径检测 (兼容 model-manager.js)
    repoId: 'damo/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-onnx',
    modelScopeRepoId: 'iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch',
    // 估算：INT8 → FP32 约 4x 体积，结合 punc/VAD 实测，整包约 2.1GB
    sizeBytes: 2100 * 1024 * 1024, // 约 2.1GB（FP32 未量化）
    recommendedSpec: '≥8 核 CPU / ≥8GB 内存（建议 12GB+ 更流畅）',
    speedHint: '接近实时 / 精度更高',
    language: 'zh',
  },
];

export function getAsrModelPreset(modelId) {
  return ASR_MODEL_PRESETS.find((preset) => preset.id === modelId);
}








