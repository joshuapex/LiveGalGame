export default function SuggestionConfigManager(BaseClass) {
  return class extends BaseClass {
    // 初始化默认建议配置
    seedDefaultSuggestionConfig() {
    const existing = this.db.prepare('SELECT COUNT(*) as count FROM suggestion_configs').get().count;
    if (existing > 0) {
      return;
    }

    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO suggestion_configs (
        id,
        enable_passive_suggestion,
        suggestion_count,
        silence_threshold_seconds,
        message_threshold_count,
        cooldown_seconds,
        context_message_limit,
        topic_detection_enabled,
        model_name,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @enable_passive_suggestion,
        @suggestion_count,
        @silence_threshold_seconds,
        @message_threshold_count,
        @cooldown_seconds,
        @context_message_limit,
        @topic_detection_enabled,
        @model_name,
        @created_at,
        @updated_at
      )
    `);

    stmt.run({
      id: 'default',
      enable_passive_suggestion: 1,
      suggestion_count: 3,
      silence_threshold_seconds: 3,
      message_threshold_count: 3,
      cooldown_seconds: 30,
      context_message_limit: 10,
      topic_detection_enabled: 0,
      model_name: 'gpt-4o-mini',
      created_at: now,
      updated_at: now
    });
  }

  // 获取建议配置
  getSuggestionConfig() {
    let config = this.db.prepare('SELECT * FROM suggestion_configs ORDER BY updated_at DESC LIMIT 1').get();
    if (!config) {
      this.seedDefaultSuggestionConfig();
      config = this.db.prepare('SELECT * FROM suggestion_configs ORDER BY updated_at DESC LIMIT 1').get();
    }
    return config;
  }

  // 更新建议配置
  updateSuggestionConfig(updates) {
    const current = this.getSuggestionConfig();
    if (!current) {
      throw new Error('Suggestion config not found');
    }

    const fields = [];
    const params = { id: current.id, updated_at: Date.now() };

    const updatableFields = [
      'enable_passive_suggestion',
      'suggestion_count',
      'silence_threshold_seconds',
      'message_threshold_count',
      'cooldown_seconds',
      'context_message_limit',
      'topic_detection_enabled',
      'model_name'
    ];

    updatableFields.forEach((field) => {
      if (updates[field] !== undefined && updates[field] !== null) {
        fields.push(`${field} = @${field}`);
        params[field] = updates[field];
      }
    });

    if (fields.length === 0) {
      return current;
    }

    const stmt = this.db.prepare(`
      UPDATE suggestion_configs
      SET ${fields.join(', ')}, updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run(params);
    return this.getSuggestionConfig();
  }
  };
}