export default function LLMConfigManager(BaseClass) {
  return class extends BaseClass {
    normalizeFeatureKey(feature) {
      if (typeof feature !== 'string') return null;
      const trimmed = feature.trim().toLowerCase();
      return trimmed || null;
    }

    // 创建或更新LLM配置
    saveLLMConfig(configData) {
      this.ensureLLMSchema();
      const now = Date.now();

      if (configData.is_default) {
        const clearDefaultStmt = this.db.prepare('UPDATE llm_configs SET is_default = 0 WHERE is_default = 1');
        clearDefaultStmt.run();
      }

      const existingStmt = this.db.prepare('SELECT * FROM llm_configs WHERE id = ? OR name = ?');
      const existing = existingStmt.get(configData.id || '', configData.name || '');

      if (existing) {
        const updateStmt = this.db.prepare(`
        UPDATE llm_configs
        SET name = @name,
            api_key = @api_key,
            base_url = @base_url,
            model_name = @model_name,
            timeout_ms = @timeout_ms,
            is_default = @is_default,
            updated_at = @updated_at
        WHERE id = @id
      `);

        updateStmt.run({
          id: existing.id,
          name: configData.name || existing.name,
          api_key: configData.api_key || existing.api_key,
          base_url: configData.base_url !== undefined ? configData.base_url : existing.base_url,
          model_name: this.normalizeModelName(
            configData.model_name ?? configData.modelName,
            existing.model_name || 'gpt-4o-mini'
          ),
          timeout_ms: configData.timeout_ms !== undefined
            ? this.normalizeTimeoutMs(configData.timeout_ms, null)
            : existing.timeout_ms,
          is_default: configData.is_default !== undefined ? (configData.is_default ? 1 : 0) : existing.is_default,
          updated_at: now
        });

        return this.getLLMConfigById(existing.id);
      }

      const insertStmt = this.db.prepare(`
        INSERT INTO llm_configs (id, name, api_key, base_url, model_name, timeout_ms, is_default, created_at, updated_at)
        VALUES (@id, @name, @api_key, @base_url, @model_name, @timeout_ms, @is_default, @created_at, @updated_at)
      `);

      const id = configData.id || this.generateId();
      insertStmt.run({
        id,
        name: configData.name || '默认配置',
        api_key: configData.api_key,
        base_url: configData.base_url || null,
        model_name: this.normalizeModelName(configData.model_name ?? configData.modelName),
        timeout_ms: this.normalizeTimeoutMs(configData.timeout_ms, null),
        is_default: configData.is_default ? 1 : 0,
        created_at: now,
        updated_at: now
      });

      return this.getLLMConfigById(id);
    }

    getAllLLMConfigs() {
      this.ensureLLMSchema();
      const stmt = this.db.prepare('SELECT * FROM llm_configs ORDER BY is_default DESC, updated_at DESC');
      return stmt.all();
    }

    getDefaultLLMConfig() {
      this.ensureLLMSchema();
      const stmt = this.db.prepare('SELECT * FROM llm_configs WHERE is_default = 1 LIMIT 1');
      return stmt.get();
    }

    getLLMConfigById(id) {
      this.ensureLLMSchema();
      const stmt = this.db.prepare('SELECT * FROM llm_configs WHERE id = ?');
      return stmt.get(id);
    }

    deleteLLMConfig(id) {
      this.ensureLLMSchema();
      this.ensureLLMFeatureSchema();
      // 先解绑功能映射，避免留下悬空引用
      this.db.prepare('UPDATE llm_feature_configs SET llm_config_id = NULL WHERE llm_config_id = ?').run(id);
      const stmt = this.db.prepare('DELETE FROM llm_configs WHERE id = ?');
      return stmt.run(id);
    }

    setDefaultLLMConfig(id) {
      this.ensureLLMSchema();
      const clearDefaultStmt = this.db.prepare('UPDATE llm_configs SET is_default = 0 WHERE is_default = 1');
      clearDefaultStmt.run();

      const setDefaultStmt = this.db.prepare('UPDATE llm_configs SET is_default = 1, updated_at = ? WHERE id = ?');
      setDefaultStmt.run(Date.now(), id);

      return this.getLLMConfigById(id);
    }

    setLLMFeatureConfig(feature, llmConfigId) {
      this.ensureLLMFeatureSchema();
      const featureKey = this.normalizeFeatureKey(feature);
      if (!featureKey) {
        throw new Error('feature 不能为空');
      }

      const now = Date.now();
      let validatedId = null;
      if (llmConfigId) {
        const exists = this.getLLMConfigById(llmConfigId);
        if (!exists) {
          throw new Error('指定的 LLM 配置不存在');
        }
        validatedId = llmConfigId;
      }

      const existing = this.db
        .prepare('SELECT feature FROM llm_feature_configs WHERE feature = ?')
        .get(featureKey);

      if (existing) {
        this.db
          .prepare(
            'UPDATE llm_feature_configs SET llm_config_id = @llm_config_id, updated_at = @updated_at WHERE feature = @feature'
          )
          .run({
            feature: featureKey,
            llm_config_id: validatedId,
            updated_at: now
          });
      } else {
        this.db
          .prepare(
            'INSERT INTO llm_feature_configs (feature, llm_config_id, created_at, updated_at) VALUES (@feature, @llm_config_id, @created_at, @updated_at)'
          )
          .run({
            feature: featureKey,
            llm_config_id: validatedId,
            created_at: now,
            updated_at: now
          });
      }

      return this.getLLMFeatureConfig(featureKey);
    }

    getLLMFeatureConfig(feature) {
      this.ensureLLMFeatureSchema();
      const featureKey = this.normalizeFeatureKey(feature);
      if (!featureKey) return null;
      return (
        this.db
          .prepare('SELECT feature, llm_config_id FROM llm_feature_configs WHERE feature = ?')
          .get(featureKey) || null
      );
    }

    getAllLLMFeatureConfigs() {
      this.ensureLLMFeatureSchema();
      const rows = this.db
        .prepare('SELECT feature, llm_config_id FROM llm_feature_configs')
        .all();
      const map = {};
      for (const row of rows) {
        map[row.feature] = row.llm_config_id || null;
      }
      return map;
    }

    /**
     * 获取某功能应使用的 LLM 配置
     * 若未绑定，则回落到默认配置
     */
    getLLMConfigForFeature(feature) {
      this.ensureLLMFeatureSchema();
      const featureKey = this.normalizeFeatureKey(feature);
      let config = null;
      if (featureKey) {
        const binding = this.db
          .prepare('SELECT llm_config_id FROM llm_feature_configs WHERE feature = ?')
          .get(featureKey);
        if (binding?.llm_config_id) {
          config = this.getLLMConfigById(binding.llm_config_id);
          // 若配置已被删除，则清理绑定，继续回落默认
          if (!config) {
            this.db
              .prepare('UPDATE llm_feature_configs SET llm_config_id = NULL WHERE feature = ?')
              .run(featureKey);
          }
        }
      }
      return config || this.getDefaultLLMConfig();
    }

    async testLLMConnection(configData) {
      this.ensureLLMSchema();
      let requestParams;
      let clientConfig;
      let timeoutMs;

      try {
        const { default: OpenAI } = await import('openai');
        clientConfig = { apiKey: configData.api_key };
        const normalizedBaseURL = this.normalizeLLMBaseURL(configData.base_url);
        if (normalizedBaseURL) {
          clientConfig.baseURL = normalizedBaseURL;
        }

        const client = new OpenAI(clientConfig);
        timeoutMs = this.normalizeTimeoutMs(configData.timeout_ms, null);
        requestParams = {
          model: configData.model_name || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
          temperature: 0
        };

        console.log('LLM Connection Test Debug Info:', {
          configData: {
            name: configData.name,
            base_url: configData.base_url,
            model_name: configData.model_name,
            timeout_ms: timeoutMs
          },
          requestParams,
          clientConfig
        });

        const controller = timeoutMs ? new AbortController() : null;
        const timer = controller
          ? setTimeout(() => controller.abort(new Error('LLM连接超时，请稍后再试')), timeoutMs)
          : null;
        let testResponse;
        try {
          testResponse = await client.chat.completions.create(
            requestParams,
            controller ? { signal: controller.signal } : undefined
          );
        } finally {
          if (timer) clearTimeout(timer);
        }

        if (testResponse && testResponse.choices && testResponse.choices.length > 0) {
          return { success: true, message: '连接成功', status: 200 };
        }

        return { success: false, message: 'API响应格式异常', status: testResponse?.status || null };
      } catch (error) {
        console.error('LLM Connection Test Failed - Full Debug Info:', {
          error: {
            message: error.message,
            status: error.status,
            code: error.code,
            type: error.type,
            param: error.param,
            headers: error.headers,
            requestID: error.requestID
          },
          configData: {
            name: configData.name,
            base_url: configData.base_url,
            model_name: configData.model_name,
            timeout_ms: timeoutMs
          },
          requestParams: requestParams || null,
          clientConfig: clientConfig || null
        });

        let errorMessage = '连接失败';
        if (error.status === 401) {
          errorMessage = 'API密钥无效';
        } else if (error.status === 403) {
          errorMessage = 'API密钥无权限';
        } else if (error.status === 404) {
          errorMessage = 'API端点不存在或模型不可用';
        } else if (error.status === 429) {
          errorMessage = '请求频率过高，请稍后再试';
        } else if (error.name === 'AbortError' || /timeout/i.test(error.message || '')) {
          errorMessage = '请求超时，请稍后再试';
        } else if (error.message) {
          errorMessage = error.message;
        }

        return { success: false, message: errorMessage, status: error.status || null, error: error.message };
      }
    }

    normalizeModelName(value, fallback = 'gpt-4o-mini') {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return fallback;
    }

    normalizeLLMBaseURL(baseURL) {
      if (!baseURL || typeof baseURL !== 'string') {
        return undefined;
      }
      const trimmed = baseURL.trim();
      if (!trimmed) {
        return undefined;
      }
      // OpenAI SDK 会自动拼接 /chat/completions，这里去掉用户可能输入的终点路径，避免 404
      if (trimmed.endsWith('/chat/completions')) {
        return trimmed.replace(/\/chat\/completions\/?$/, '');
      }
      // 统一去掉尾部斜杠
      return trimmed.replace(/\/+$/, '');
    }

    normalizeTimeoutMs(value, fallback = null) {
      if (value === null || value === undefined || value === '') {
        return fallback;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
      }
      return Math.round(parsed);
    }

    ensureLLMSchema() {
      if (this._llmSchemaEnsured) {
        this.ensureLLMFeatureSchema();
        return;
      }

      const columns = this.db.prepare('PRAGMA table_info(llm_configs)').all();
      if (!columns.length) {
        // Table not created yet; schema initialization will handle it.
        this.ensureLLMFeatureSchema();
        this._llmSchemaEnsured = true;
        return;
      }
      const columnNames = columns.map((column) => column.name);
      const hasProvider = columnNames.includes('provider');
      const hasModel = columnNames.includes('model_name');
      const hasTimeout = columnNames.includes('timeout_ms');

      if (hasProvider) {
        this.rebuildLLMConfigTable(columns);
      } else if (!hasModel) {
        this.db.prepare("ALTER TABLE llm_configs ADD COLUMN model_name TEXT NOT NULL DEFAULT 'gpt-4o-mini'").run();
        this.db
          .prepare(
            "UPDATE llm_configs SET model_name = 'gpt-4o-mini' WHERE model_name IS NULL OR TRIM(model_name) = ''"
          )
          .run();
      }
      if (!hasTimeout) {
        this.db.prepare('ALTER TABLE llm_configs ADD COLUMN timeout_ms INTEGER').run();
      }

      this.ensureLLMFeatureSchema();
      this._llmSchemaEnsured = true;
    }

    ensureLLMFeatureSchema() {
      if (this._llmFeatureSchemaEnsured) return;
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS llm_feature_configs (
          feature TEXT PRIMARY KEY,
          llm_config_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (llm_config_id) REFERENCES llm_configs(id) ON DELETE SET NULL
        )
      `);
      this.db
        .prepare('CREATE INDEX IF NOT EXISTS idx_llm_feature_config_id ON llm_feature_configs(llm_config_id)')
        .run();
      this._llmFeatureSchemaEnsured = true;
    }

    rebuildLLMConfigTable(existingColumns) {
      const transaction = this.db.transaction(() => {
        this.db.prepare('ALTER TABLE llm_configs RENAME TO llm_configs_backup').run();
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS llm_configs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            api_key TEXT NOT NULL,
            base_url TEXT,
            model_name TEXT NOT NULL DEFAULT 'gpt-4o-mini',
            timeout_ms INTEGER,
            is_default INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);

        const hasModel = existingColumns.some((column) => column.name === 'model_name');
        const modelExpression = hasModel ? "COALESCE(model_name, 'gpt-4o-mini')" : "'gpt-4o-mini'";
        const hasTimeout = existingColumns.some((column) => column.name === 'timeout_ms');
        const timeoutExpression = hasTimeout ? 'timeout_ms' : 'NULL';

        this.db.prepare(`
          INSERT INTO llm_configs (id, name, api_key, base_url, model_name, timeout_ms, is_default, created_at, updated_at)
          SELECT
            id,
            name,
            api_key,
            base_url,
            ${modelExpression},
            ${timeoutExpression},
            is_default,
            created_at,
            updated_at
          FROM llm_configs_backup
        `).run();

        this.db.prepare('CREATE INDEX IF NOT EXISTS idx_llm_configs_is_default ON llm_configs(is_default)').run();
        this.db.prepare('DROP TABLE llm_configs_backup').run();
      });

      transaction();
    }
  };
}
