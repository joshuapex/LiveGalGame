export default function CharacterDetailsManager(BaseClass) {
  return class extends BaseClass {
    // 获取角色详情
    getCharacterDetails(characterId) {
    try {
      const stmt = this.db.prepare('SELECT * FROM character_details WHERE character_id = ?');
      const row = stmt.get(characterId);

      if (!row) {
        // 如果没有详情记录，尝试从会话中生成
        return this.generateCharacterDetailsFromConversations(characterId);
      }

      // 解析JSON字段
      return {
        character_id: row.character_id,
        profile: row.profile ? JSON.parse(row.profile) : null,
        personality_traits: row.personality_traits ? JSON.parse(row.personality_traits) : null,
        likes_dislikes: row.likes_dislikes ? JSON.parse(row.likes_dislikes) : null,
        important_events: row.important_events ? JSON.parse(row.important_events) : null,
        conversation_summary: row.conversation_summary,
        custom_fields: row.custom_fields ? JSON.parse(row.custom_fields) : {},
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Error getting character details:', error);
      return null;
    }
  }

  // 从会话中生成角色详情
  generateCharacterDetailsFromConversations(characterId) {
    try {
      // 获取角色的所有对话
      const conversations = this.getConversationsByCharacter(characterId);

      if (conversations.length === 0) {
        return {
          character_id: characterId,
          profile: null,
          personality_traits: null,
          likes_dislikes: null,
          important_events: null,
          conversation_summary: '暂无对话记录',
          custom_fields: {},
          updated_at: Date.now()
        };
      }

      // 收集所有消息
      const allMessages = [];
      const allSummaries = [];
      const allTags = [];
      const affinityChanges = [];

      for (const conv of conversations) {
        const messages = this.getMessagesByConversation(conv.id);
        allMessages.push(...messages);

        if (conv.summary) {
          allSummaries.push(conv.summary);
        }

        if (conv.tags) {
          allTags.push(...conv.tags.split(',').map(t => t.trim()));
        }

        if (conv.affinity_change) {
          affinityChanges.push(conv.affinity_change);
        }
      }

      // 提取角色消息（sender = 'character'）
      const characterMessages = allMessages
        .filter(msg => msg.sender === 'character')
        .map(msg => msg.content);

      // 生成性格特点（从消息中提取关键词和模式）
      const personalityTraits = this.extractPersonalityTraits(characterMessages, allTags);

      // 生成喜好厌恶（从消息中提取）
      const likesDislikes = this.extractLikesDislikes(characterMessages);

      // 生成重要事件（从对话标题和摘要中提取）
      const importantEvents = this.extractImportantEvents(conversations);

      // 生成对话总结
      const conversationSummary = this.generateConversationSummary(conversations, allSummaries, affinityChanges);

      // 生成角色档案（基本信息）
      const character = this.getCharacterById(characterId);
      const profile = character ? {
        name: character.name,
        nickname: character.nickname,
        relationship_label: character.relationship_label,
        affinity: character.affinity,
        tags: character.tags || [],
        created_at: character.created_at,
        notes: character.notes
      } : null;

      const details = {
        character_id: characterId,
        profile: profile,
        personality_traits: personalityTraits,
        likes_dislikes: likesDislikes,
        important_events: importantEvents,
        conversation_summary: conversationSummary,
        custom_fields: {},
        updated_at: Date.now()
      };

      // 保存到数据库
      this.saveCharacterDetails(characterId, details);

      return details;
    } catch (error) {
      console.error('Error generating character details:', error);
      return null;
    }
  }

  // 提取性格特点
  extractPersonalityTraits(messages, tags) {
    const traits = {
      keywords: [],
      descriptions: []
    };

    // 从标签中提取
    if (tags && tags.length > 0) {
      traits.keywords = [...new Set(tags)];
    }

    // 从消息中分析（简单关键词匹配）
    const traitKeywords = {
      '温柔': ['温柔', '体贴', '关心', '照顾'],
      '活泼': ['开心', '快乐', '兴奋', '活泼', '活跃'],
      '认真': ['认真', '负责', '仔细', '专注'],
      '内向': ['安静', '内向', '害羞', '沉默'],
      '外向': ['外向', '开朗', '健谈', '热情'],
      '幽默': ['有趣', '幽默', '搞笑', '玩笑'],
      '真诚': ['真诚', '诚实', '真实', '坦率']
    };

    const foundTraits = new Set();
    const messageText = messages.join(' ');

    for (const [trait, keywords] of Object.entries(traitKeywords)) {
      if (keywords.some(keyword => messageText.includes(keyword))) {
        foundTraits.add(trait);
      }
    }

    traits.keywords = [...new Set([...traits.keywords, ...foundTraits])];

    // 生成描述
    if (traits.keywords.length > 0) {
      traits.descriptions = [
        `从对话中可以看出，${traits.keywords.slice(0, 3).join('、')}是主要特点。`,
        `在互动中表现出${traits.keywords[0]}的一面。`
      ];
    }

    return traits;
  }

  // 提取喜好厌恶
  extractLikesDislikes(messages) {
    const likes = [];
    const dislikes = [];

    const messageText = messages.join(' ');

    // 简单的关键词匹配（实际应用中可以使用更复杂的NLP）
    const likeKeywords = ['喜欢', '爱好', '感兴趣', '爱', '享受', '享受', '享受'];
    const dislikeKeywords = ['不喜欢', '讨厌', '厌恶', '反感', '不感兴趣'];

    // 提取包含"喜欢"的句子片段
    const likePatterns = messageText.match(/喜欢[^，。！？]*/g) || [];
    likePatterns.forEach(pattern => {
      const cleaned = pattern.replace(/喜欢/g, '').trim();
      if (cleaned && cleaned.length < 20) {
        likes.push(cleaned);
      }
    });

    // 提取包含"不喜欢"的句子片段
    const dislikePatterns = messageText.match(/不(喜欢|感兴趣)[^，。！？]*/g) || [];
    dislikePatterns.forEach(pattern => {
      const cleaned = pattern.replace(/不(喜欢|感兴趣)/g, '').trim();
      if (cleaned && cleaned.length < 20) {
        dislikes.push(cleaned);
      }
    });

    return {
      likes: [...new Set(likes)].slice(0, 10), // 最多10个
      dislikes: [...new Set(dislikes)].slice(0, 10)
    };
  }

  // 提取重要事件
  extractImportantEvents(conversations) {
    const events = [];

    conversations.forEach(conv => {
      if (conv.title || conv.summary) {
        events.push({
          title: conv.title || '对话',
          summary: conv.summary || '',
          date: conv.date,
          affinity_change: conv.affinity_change || 0
        });
      }
    });

    // 按日期排序，最新的在前
    events.sort((a, b) => b.date - a.date);

    return events.slice(0, 10); // 最多10个重要事件
  }

  // 生成对话总结
  generateConversationSummary(conversations, summaries, affinityChanges) {
    const totalConversations = conversations.length;
    const totalAffinityChange = affinityChanges.reduce((sum, change) => sum + change, 0);
    const avgAffinityChange = affinityChanges.length > 0
      ? Math.round(totalAffinityChange / affinityChanges.length)
      : 0;

    let summary = `共进行了 ${totalConversations} 次对话。`;

    if (summaries.length > 0) {
      summary += `主要话题包括：${summaries.slice(0, 3).join('、')}。`;
    }

    if (totalAffinityChange !== 0) {
      const trend = totalAffinityChange > 0 ? '上升' : '下降';
      summary += `好感度总体${trend}了 ${Math.abs(totalAffinityChange)} 点。`;
    }

    return summary;
  }

  // 保存角色详情
  saveCharacterDetails(characterId, details) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO character_details
        (character_id, profile, personality_traits, likes_dislikes, important_events, conversation_summary, custom_fields, updated_at)
        VALUES (@character_id, @profile, @personality_traits, @likes_dislikes, @important_events, @conversation_summary, @custom_fields, @updated_at)
      `);

      stmt.run({
        character_id: characterId,
        profile: details.profile ? JSON.stringify(details.profile) : null,
        personality_traits: details.personality_traits ? JSON.stringify(details.personality_traits) : null,
        likes_dislikes: details.likes_dislikes ? JSON.stringify(details.likes_dislikes) : null,
        important_events: details.important_events ? JSON.stringify(details.important_events) : null,
        conversation_summary: details.conversation_summary || null,
        custom_fields: details.custom_fields ? JSON.stringify(details.custom_fields) : '{}',
        updated_at: details.updated_at || Date.now()
      });

      return true;
    } catch (error) {
      console.error('Error saving character details:', error);
      return false;
    }
  }

  // 更新角色详情的自定义字段
  updateCharacterDetailsCustomFields(characterId, customFields) {
    try {
      const currentDetails = this.getCharacterDetails(characterId);
      if (!currentDetails) {
        return false;
      }

      const updatedCustomFields = {
        ...(currentDetails.custom_fields || {}),
        ...customFields
      };

      const stmt = this.db.prepare(`
        UPDATE character_details
        SET custom_fields = @custom_fields, updated_at = @updated_at
        WHERE character_id = @character_id
      `);

      stmt.run({
        character_id: characterId,
        custom_fields: JSON.stringify(updatedCustomFields),
        updated_at: Date.now()
      });

      return true;
    } catch (error) {
      console.error('Error updating custom fields:', error);
      return false;
    }
  }
  };
}