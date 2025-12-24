export default function AIAnalysisManager(BaseClass) {
  return class extends BaseClass {
    ensureSuggestionDecisionSchema() {
      if (this._suggestionDecisionSchemaEnsured) return;

      // 1) 确保新表存在（即使老库里没有）
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS decision_points (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          anchor_message_id TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (anchor_message_id) REFERENCES messages(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS suggestion_batches (
          id TEXT PRIMARY KEY,
          decision_point_id TEXT NOT NULL,
          trigger TEXT,
          reason TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (decision_point_id) REFERENCES decision_points(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_decision_points_conversation_id ON decision_points(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_suggestion_batches_decision_point_id ON suggestion_batches(decision_point_id);
      `);

      // 2) 迁移 ai_suggestions：需要新增列，并删除 is_used（SQLite 需重建表）
      const columns = this.db.prepare('PRAGMA table_info(ai_suggestions)').all();
      if (columns && columns.length > 0) {
        const names = columns.map((c) => c.name);
        const hasIsUsed = names.includes('is_used');
        const hasDecisionPointId = names.includes('decision_point_id');
        const hasBatchId = names.includes('batch_id');
        const hasSuggestionIndex = names.includes('suggestion_index');
        const hasIsSelected = names.includes('is_selected');
        const hasSelectedAt = names.includes('selected_at');

        const needsRebuild =
          hasIsUsed || !hasDecisionPointId || !hasBatchId || !hasSuggestionIndex;

        if (needsRebuild) {
          const transaction = this.db.transaction(() => {
            this.db.prepare('ALTER TABLE ai_suggestions RENAME TO ai_suggestions_backup').run();

            this.db.exec(`
              CREATE TABLE IF NOT EXISTS ai_suggestions (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                message_id TEXT,
                decision_point_id TEXT,
                batch_id TEXT,
                suggestion_index INTEGER,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                affinity_prediction INTEGER,
                tags TEXT,
                is_selected INTEGER DEFAULT 0,
                selected_at INTEGER,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
              );
            `);

            const backupColumns = this.db.prepare('PRAGMA table_info(ai_suggestions_backup)').all();
            const backupNames = backupColumns.map((c) => c.name);
            const hasAffinity = backupNames.includes('affinity_prediction');
            const hasTags = backupNames.includes('tags');
            const hasSelected = backupNames.includes('is_selected');
            const hasSelectedAt = backupNames.includes('selected_at');

            // 旧表没有 suggestion_index / decision_point_id / batch_id，统一置 NULL
            const affinitySelect = hasAffinity ? 'affinity_prediction' : 'NULL';
            const tagsSelect = hasTags ? 'tags' : "''";
            const selectedSelect = hasSelected ? 'is_selected' : '0';
            const selectedAtSelect = hasSelectedAt ? 'selected_at' : 'NULL';

            this.db
              .prepare(`
                INSERT INTO ai_suggestions (
                  id, conversation_id, message_id,
                  decision_point_id, batch_id, suggestion_index,
                  title, content, affinity_prediction, tags,
                  is_selected, selected_at,
                  created_at
                )
                SELECT
                  id, conversation_id, message_id,
                  NULL, NULL, NULL,
                  title, content, ${affinitySelect}, ${tagsSelect}, ${selectedSelect}, ${selectedAtSelect}, created_at
                FROM ai_suggestions_backup
              `)
              .run();

            this.db.prepare('DROP TABLE ai_suggestions_backup').run();

            // 索引补齐
            this.db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_conversation_id ON ai_suggestions(conversation_id)').run();
            this.db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_decision_point_id ON ai_suggestions(decision_point_id)').run();
            this.db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_batch_id ON ai_suggestions(batch_id)').run();
          });
          transaction();
        } else {
          // 仅补齐索引
          this.db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_decision_point_id ON ai_suggestions(decision_point_id)').run();
          this.db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_suggestions_batch_id ON ai_suggestions(batch_id)').run();

          // 新增字段（向前兼容）
          if (!hasIsSelected) {
            this.db.prepare('ALTER TABLE ai_suggestions ADD COLUMN is_selected INTEGER DEFAULT 0').run();
          }
          if (!hasSelectedAt) {
            this.db.prepare('ALTER TABLE ai_suggestions ADD COLUMN selected_at INTEGER').run();
          }
        }
      }

      this._suggestionDecisionSchemaEnsured = true;
    }

    createDecisionPoint({ conversationId, anchorMessageId = null, createdAt = null } = {}) {
      this.ensureSuggestionDecisionSchema();
      if (!conversationId) throw new Error('conversationId is required');
      const now = createdAt || Date.now();
      const id = `dp-${now}-${Math.random().toString(36).slice(2, 8)}`;
      this.db
        .prepare(
          `
          INSERT INTO decision_points (id, conversation_id, anchor_message_id, created_at)
          VALUES (@id, @conversation_id, @anchor_message_id, @created_at)
        `
        )
        .run({
          id,
          conversation_id: conversationId,
          anchor_message_id: anchorMessageId,
          created_at: now
        });
      return id;
    }

    createSuggestionBatch({ decisionPointId, trigger = null, reason = null, createdAt = null } = {}) {
      this.ensureSuggestionDecisionSchema();
      if (!decisionPointId) throw new Error('decisionPointId is required');
      const now = createdAt || Date.now();
      const id = `batch-${now}-${Math.random().toString(36).slice(2, 8)}`;
      this.db
        .prepare(
          `
          INSERT INTO suggestion_batches (id, decision_point_id, trigger, reason, created_at)
          VALUES (@id, @decision_point_id, @trigger, @reason, @created_at)
        `
        )
        .run({
          id,
          decision_point_id: decisionPointId,
          trigger,
          reason,
          created_at: now
        });
      return id;
    }

    getDecisionPointById(id) {
      this.ensureSuggestionDecisionSchema();
      if (!id) return null;
      try {
        const stmt = this.db.prepare('SELECT * FROM decision_points WHERE id = ?');
        return stmt.get(id) || null;
      } catch (error) {
        console.error('Error getting decision point:', error);
        return null;
      }
    }

    getSuggestionBatchById(id) {
      this.ensureSuggestionDecisionSchema();
      if (!id) return null;
      try {
        const stmt = this.db.prepare('SELECT * FROM suggestion_batches WHERE id = ?');
        return stmt.get(id) || null;
      } catch (error) {
        console.error('Error getting suggestion batch:', error);
        return null;
      }
    }

    // 获取对话的AI分析报告
    getConversationAnalysis(conversationId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM ai_analysis
        WHERE conversation_id = ? AND insight_type = 'analysis_report'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const result = stmt.get(conversationId);
      console.log(`[DB] getConversationAnalysis for ${conversationId}:`, result ? 'found' : 'not found');
      if (result) {
        console.log(`[DB] Analysis report content:`, result.content);
      }
      return result || null;
    } catch (error) {
      console.error('Error getting conversation analysis:', error);
      return null;
    }
  }

  // 获取对话的关键时刻回放
  getKeyMoments(conversationId) {
    try {
      const stmt = this.db.prepare(`
        SELECT
          a.*,
          m.content as message_content,
          m.timestamp as message_timestamp,
          m.sender
        FROM ai_analysis a
        LEFT JOIN messages m ON a.message_id = m.id
        WHERE a.conversation_id = ? AND a.insight_type = 'key_moment'
        ORDER BY a.created_at ASC
      `);
      return stmt.all(conversationId) || [];
    } catch (error) {
      console.error('Error getting key moments:', error);
      return [];
    }
  }

  // 获取对话的行动建议
  getActionSuggestions(conversationId) {
    try {
      this.ensureSuggestionDecisionSchema();
      const stmt = this.db.prepare(`
        SELECT * FROM ai_suggestions
        WHERE conversation_id = ?
        ORDER BY created_at DESC
      `);
      return stmt.all(conversationId) || [];
    } catch (error) {
      console.error('Error getting action suggestions:', error);
      return [];
    }
  }

  // 保存行动建议到数据库
  saveActionSuggestion(suggestion, conversationId, messageId = null) {
    try {
      this.ensureSuggestionDecisionSchema();
      if (!suggestion || !conversationId) {
        console.warn('[DB] saveActionSuggestion: Missing required fields', { suggestion, conversationId });
        return null;
      }

      const stmt = this.db.prepare(`
        INSERT INTO ai_suggestions (
          id, conversation_id, message_id,
          decision_point_id, batch_id, suggestion_index,
          title, content,
          affinity_prediction, tags, created_at
        ) VALUES (
          @id, @conversation_id, @message_id,
          @decision_point_id, @batch_id, @suggestion_index,
          @title, @content,
          @affinity_prediction, @tags, @created_at
        )
      `);

      const tagsStr = Array.isArray(suggestion.tags) 
        ? suggestion.tags.join(',') 
        : (suggestion.tags || '');

      const now = Date.now();
      const suggestionId = suggestion.id || `suggestion-${now}-${Math.random().toString(36).substr(2, 9)}`;

      stmt.run({
        id: suggestionId,
        conversation_id: conversationId,
        message_id: messageId,
        decision_point_id: suggestion.decision_point_id || suggestion.decisionPointId || null,
        batch_id: suggestion.batch_id || suggestion.batchId || null,
        suggestion_index:
          suggestion.suggestion_index !== undefined
            ? suggestion.suggestion_index
            : suggestion.index !== undefined
              ? suggestion.index
              : null,
        title: suggestion.title || suggestion.content || '未命名建议',
        content: suggestion.content || suggestion.title || '',
        affinity_prediction: suggestion.affinity_prediction || null,
        tags: tagsStr,
        created_at: suggestion.created_at || now
      });

      console.log(`[DB] Saved action suggestion: ${suggestionId} for conversation: ${conversationId}`);
      return suggestionId;
    } catch (error) {
      console.error('Error saving action suggestion:', error);
      return null;
    }
  }

  /**
   * 用户显式确认“采用了哪个建议”
   * - 默认按 batch_id 互斥（同一批次只能选一个）
   * - 如果没有 batch_id，则回退按 decision_point_id 互斥
   */
  selectActionSuggestion({ suggestionId, selected = true, selectedAt = null } = {}) {
    try {
      this.ensureSuggestionDecisionSchema();
      if (!suggestionId) throw new Error('suggestionId is required');

      const row = this.db
        .prepare('SELECT id, batch_id, decision_point_id FROM ai_suggestions WHERE id = ? LIMIT 1')
        .get(suggestionId);
      if (!row) {
        throw new Error(`Suggestion not found: ${suggestionId}`);
      }

      const ts = selectedAt || Date.now();
      const scope = row.batch_id || row.decision_point_id || null;
      const scopeField = row.batch_id ? 'batch_id' : (row.decision_point_id ? 'decision_point_id' : null);

      const tx = this.db.transaction(() => {
        if (scopeField && scope) {
          // 互斥：同一 scope 先全部清空
          this.db
            .prepare(`UPDATE ai_suggestions SET is_selected = 0, selected_at = NULL WHERE ${scopeField} = ?`)
            .run(scope);
        } else {
          // 无 scope：至少确保当前项能被正确更新
          this.db.prepare('UPDATE ai_suggestions SET is_selected = 0, selected_at = NULL WHERE id = ?').run(suggestionId);
        }

        if (selected) {
          this.db
            .prepare('UPDATE ai_suggestions SET is_selected = 1, selected_at = ? WHERE id = ?')
            .run(ts, suggestionId);
        }
      });

      tx();
      return true;
    } catch (error) {
      console.error('[DB] selectActionSuggestion failed:', error);
      return false;
    }
  }

  // 获取对话的完整AI分析数据
  getConversationAIData(conversationId) {
    console.log(`[DB] Getting AI data for conversation: ${conversationId}`);

    // 获取分析报告
    const analysisReport = this.getConversationAnalysis(conversationId);
    console.log(`[DB] Analysis report found:`, analysisReport ? 'yes' : 'no');

    // 获取关键时刻
    const keyMoments = this.getKeyMoments(conversationId);
    console.log(`[DB] Key moments found: ${keyMoments.length}`);

    // 获取行动建议
    const actionSuggestions = this.getActionSuggestions(conversationId);
    console.log(`[DB] Action suggestions found: ${actionSuggestions.length}`);

    // 获取对话信息以获取角色ID
    const conversation = this.getConversationById(conversationId);

    // 获取本轮对话的表现态度分析（从ai_analysis表获取）
    let attitudeAnalysis = null;
    try {
      const attitudeStmt = this.db.prepare(`
        SELECT content FROM ai_analysis
        WHERE conversation_id = ? AND insight_type = 'attitude_analysis'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const attitudeData = attitudeStmt.get(conversationId);
      if (attitudeData && attitudeData.content) {
        // 如果content是JSON，解析它；否则直接使用
        try {
          const parsed = JSON.parse(attitudeData.content);
          const affinityChange = parsed.affinityChange || conversation?.affinity_change || 0;
          attitudeAnalysis = {
            description: parsed.description || parsed.content || attitudeData.content,
            affinityChange: affinityChange,
            trend: parsed.trend || (affinityChange > 0 ? '上升' : affinityChange < 0 ? '下降' : '持平')
          };
        } catch (e) {
          // 如果不是JSON，直接使用字符串，从conversation获取affinity_change
          const affinityChange = conversation?.affinity_change || 0;
          attitudeAnalysis = {
            description: attitudeData.content,
            affinityChange: affinityChange,
            trend: affinityChange > 0 ? '上升' : affinityChange < 0 ? '下降' : '持平'
          };
        }
      } else if (conversation) {
        // 如果没有专门的attitude_analysis，使用conversation的affinity_change作为基础
        const affinityChange = conversation.affinity_change || 0;
        attitudeAnalysis = {
          description: '本轮对话中，对方表现积极，互动良好。',
          affinityChange: affinityChange,
          trend: affinityChange > 0 ? '上升' : affinityChange < 0 ? '下降' : '持平'
        };
      }
    } catch (error) {
      console.error('Error getting attitude analysis:', error);
    }

    // 解析分析报告
    let parsedReport = null;
    if (analysisReport && analysisReport.content) {
      try {
        parsedReport = JSON.parse(analysisReport.content);
      } catch (e) {
        console.error('Failed to parse analysis report:', e);
      }
    }

    // 解析关键时刻评价
    const parsedKeyMoments = keyMoments.map(km => {
      let evaluation = null;
      if (km.content) {
        try {
          evaluation = JSON.parse(km.content);
        } catch (e) {
          evaluation = km.content; // 如果不是JSON，直接使用字符串
        }
      }
      return {
        id: km.id,
        timestamp: km.message_timestamp,
        messageContent: km.message_content,
        sender: km.sender,
        evaluation: evaluation
      };
    });

    const result = {
      analysisReport: parsedReport,
      keyMoments: parsedKeyMoments,
      attitudeAnalysis,
      actionSuggestions: actionSuggestions.map(as => ({
        id: as.id,
        title: as.title,
        content: as.content,
        tags: as.tags ? as.tags.split(',').map(t => t.trim()) : []
      }))
    };

    console.log(`[DB] Returning AI data:`, {
      hasAnalysisReport: !!result.analysisReport,
      keyMomentsCount: result.keyMoments.length,
      hasAttitudeAnalysis: !!result.attitudeAnalysis,
      actionSuggestionsCount: result.actionSuggestions.length
    });

    return result;
  }
  };
}
