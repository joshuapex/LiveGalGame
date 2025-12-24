-- LiveGalGame Database Base Schema
-- 基础版本，不包含新的 decision_points 和 suggestion_batches 表
-- 用于向后兼容旧数据库

-- 攻略对象表
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  relationship_label TEXT, -- 关系标签（青梅竹马、学生会长等）
  avatar_color TEXT, -- 头像颜色
  affinity INTEGER DEFAULT 50, -- 好感度（0-100）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  notes TEXT -- 备注
);

-- 关键词标签表（用于角色特点）
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT 'primary' -- 标签颜色
);

-- 角色-标签关联表
CREATE TABLE IF NOT EXISTS character_tags (
  character_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (character_id, tag_id),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 对话记录表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  title TEXT, -- 对话标题
  date INTEGER NOT NULL, -- 对话日期（时间戳）
  affinity_change INTEGER DEFAULT 0, -- 好感度变化
  summary TEXT, -- 对话摘要
  tags TEXT, -- 标签（逗号分隔）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 消息记录表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender TEXT NOT NULL, -- 'user' or 'character'
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  is_ai_generated INTEGER DEFAULT 0, -- 是否AI生成
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- AI分析记录表
CREATE TABLE IF NOT EXISTS ai_analysis (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT, -- 关联的具体消息（可选）
  insight_type TEXT, -- 洞察类型（情感分析、建议等）
  content TEXT NOT NULL, -- 分析内容
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- AI建议记录表（基础版本，兼容旧数据库）
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT, -- 关联的具体消息（可选）
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  affinity_prediction INTEGER, -- 好感度变化预测
  tags TEXT, -- 标签（逗号分隔）
  is_selected INTEGER DEFAULT 0, -- 用户显式选择（用于“我采用了哪个建议”）
  selected_at INTEGER, -- 选择时间戳（毫秒）
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- 角色详细信息表（从会话中总结）
CREATE TABLE IF NOT EXISTS character_details (
  character_id TEXT PRIMARY KEY,
  profile TEXT, -- JSON格式：角色档案（基本信息、背景等）
  personality_traits TEXT, -- JSON格式：性格特点（从对话中总结）
  likes_dislikes TEXT, -- JSON格式：喜好厌恶（从对话中提取）
  important_events TEXT, -- JSON格式：重要事件（从对话中提取）
  conversation_summary TEXT, -- 对话总结
  custom_fields TEXT, -- JSON格式：自定义字段（可扩展）
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- LLM配置表
CREATE TABLE IF NOT EXISTS llm_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- 配置名称
  api_key TEXT NOT NULL, -- API密钥
  base_url TEXT, -- API基础URL（可选，默认使用提供商的标准URL）
  model_name TEXT NOT NULL DEFAULT 'gpt-4o-mini', -- 模型名称
  timeout_ms INTEGER, -- 请求超时（毫秒，可选）
  is_default INTEGER DEFAULT 0, -- 是否为默认配置
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- LLM 功能绑定表（为特定功能选择指定的 LLM 配置；未配置则回落到默认 LLM）
CREATE TABLE IF NOT EXISTS llm_feature_configs (
  feature TEXT PRIMARY KEY, -- 功能标识，如 suggestion / situation / review
  llm_config_id TEXT, -- 绑定的 llm_configs.id
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (llm_config_id) REFERENCES llm_configs(id) ON DELETE SET NULL
);

-- 对话建议配置表
CREATE TABLE IF NOT EXISTS suggestion_configs (
  id TEXT PRIMARY KEY,
  enable_passive_suggestion INTEGER DEFAULT 1,
  suggestion_count INTEGER DEFAULT 3,
  silence_threshold_seconds INTEGER DEFAULT 3,
  message_threshold_count INTEGER DEFAULT 3,
  cooldown_seconds INTEGER DEFAULT 30,
  context_message_limit INTEGER DEFAULT 10,
  topic_detection_enabled INTEGER DEFAULT 0,
  situation_llm_enabled INTEGER DEFAULT 0,
  model_name TEXT DEFAULT 'gpt-4o-mini',
  situation_model_name TEXT DEFAULT 'gpt-4o-mini',
  thinking_enabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ==================== ASR（语音识别）相关表 ====================

-- 音频源配置表（两个音源：speaker1, speaker2）
CREATE TABLE IF NOT EXISTS audio_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- 音源名称（Speaker 1 / Speaker 2）
  is_active INTEGER DEFAULT 0, -- 是否启用
  device_id TEXT, -- 设备ID（系统音频设备标识）
  device_name TEXT, -- 设备名称（显示用）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 语音识别记录表
CREATE TABLE IF NOT EXISTS speech_recognition_records (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL, -- 关联的对话
  source_id TEXT NOT NULL, -- 音频源ID
  message_id TEXT, -- 关联的消息（识别完成后关联）
  audio_data BLOB, -- 音频数据（可选，用于回放，如果 retain_audio_files=0 则为 NULL）
  audio_file_path TEXT, -- 音频文件路径（如果 retain_audio_files=1）
  audio_duration REAL, -- 音频时长（秒）
  recognized_text TEXT, -- 识别结果
  confidence REAL, -- 置信度
  start_time INTEGER NOT NULL, -- 识别开始时间
  end_time INTEGER, -- 识别结束时间
  status TEXT NOT NULL, -- 状态：'recording', 'recognizing', 'completed', 'failed'
  error_message TEXT, -- 错误信息
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES audio_sources(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- ASR 配置表
CREATE TABLE IF NOT EXISTS asr_configs (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL, -- 模型名称（whisper-tiny/whisper-base 等）
  language TEXT NOT NULL DEFAULT 'zh', -- 识别语言
  enable_vad INTEGER DEFAULT 1, -- 是否启用 VAD
  sentence_pause_threshold REAL DEFAULT 1.0, -- 分句停顿阈值（秒）
  retain_audio_files INTEGER DEFAULT 0, -- 是否保留录音文件（0: 不保留，1: 保留）
  audio_retention_days INTEGER DEFAULT 30, -- 录音文件保留天数
  audio_storage_path TEXT, -- 录音文件存储路径（为空则使用默认路径）
  is_default INTEGER DEFAULT 0, -- 是否为默认配置
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_conversations_character_id ON conversations(character_id);
CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversations(date);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_character_tags_character_id ON character_tags(character_id);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_conversation_id ON ai_analysis(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_conversation_id ON ai_suggestions(conversation_id);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_speech_records_conversation_id ON speech_recognition_records(conversation_id);
CREATE INDEX IF NOT EXISTS idx_speech_records_source_id ON speech_recognition_records(source_id);
CREATE INDEX IF NOT EXISTS idx_speech_records_status ON speech_recognition_records(status);
CREATE INDEX IF NOT EXISTS idx_speech_records_created_at ON speech_recognition_records(created_at);
CREATE INDEX IF NOT EXISTS idx_asr_configs_is_default ON asr_configs(is_default);

-- 剧情复盘表
CREATE TABLE IF NOT EXISTS conversation_reviews (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  review_data TEXT NOT NULL,  -- TOON 格式解析后存为 JSON
  created_at INTEGER NOT NULL,
  model_used TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
