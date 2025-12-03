export default function LLMConfigManager(BaseClass) {
  return class extends BaseClass {
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
          is_default: configData.is_default !== undefined ? (configData.is_default ? 1 : 0) : existing.is_default,
          updated_at: now
        });

        return this.getLLMConfigById(existing.id);
      }

      const insertStmt = this.db.prepare(`
        INSERT INTO llm_configs (id, name, api_key, base_url, model_name, is_default, created_at, updated_at)
        VALUES (@id, @name, @api_key, @base_url, @model_name, @is_default, @created_at, @updated_at)
      `);

      const id = configData.id || this.generateId();
      insertStmt.run({
        id,
        name: configData.name || '默认配置',
        api_key: configData.api_key,
        base_url: configData.base_url || null,
        model_name: this.normalizeModelName(configData.model_name ?? configData.modelName),
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

    async testLLMConnection(configData) {
      this.ensureLLMSchema();
      try {
        const { default: OpenAI } = await import('openai');
        const config = { apiKey: configData.api_key };
        if (configData.base_url) {
          config.baseURL = configData.base_url;
        }

        const client = new OpenAI(config);
        const requestParams = {
          model: configData.model_name || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
          temperature: 0
        };

        console.log('LLM Connection Test Debug Info:', {
          configData: {
            name: configData.name,
            base_url: configData.base_url,
            model_name: configData.model_name
          },
          requestParams,
          clientConfig: config
        });

        const testResponse = await client.chat.completions.create(requestParams);

        if (testResponse && testResponse.choices && testResponse.choices.length > 0) {
          return { success: true, message: '连接成功' };
        }

        return { success: false, message: 'API响应格式异常' };
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
            model_name: configData.model_name
          },
          requestParams,
          clientConfig: config
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
        } else if (error.message) {
          errorMessage = error.message;
        }

        return { success: false, message: errorMessage, error: error.message };
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

    ensureLLMSchema() {
      if (this._llmSchemaEnsured) {
        return;
      }

      const columns = this.db.prepare('PRAGMA table_info(llm_configs)').all();
      if (!columns.length) {
        // Table not created yet; schema initialization will handle it.
        this._llmSchemaEnsured = true;
        return;
      }
      const columnNames = columns.map((column) => column.name);
      const hasProvider = columnNames.includes('provider');
      const hasModel = columnNames.includes('model_name');

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

      this._llmSchemaEnsured = true;
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
            is_default INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);

        const hasModel = existingColumns.some((column) => column.name === 'model_name');
        const modelExpression = hasModel ? "COALESCE(model_name, 'gpt-4o-mini')" : "'gpt-4o-mini'";

        this.db.prepare(`
          INSERT INTO llm_configs (id, name, api_key, base_url, model_name, is_default, created_at, updated_at)
          SELECT
            id,
            name,
            api_key,
            base_url,
            ${modelExpression},
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