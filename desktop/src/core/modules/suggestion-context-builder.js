const DEFAULT_MESSAGE_LIMIT = 20;
const MAX_MESSAGE_CHARS = 500;

const POSITIVE_KEYWORDS = ['谢谢', '感激', '喜欢', '开心', '愉快', '高兴', '满意'];
const NEGATIVE_KEYWORDS = ['生气', '难过', '失望', '烦', '累', '不爽', '吵'];
const QUESTION_KEYWORDS = ['吗', '呢', '?', '？', '怎么', '为何', '可以', '要不要', '愿不愿意', '能否'];
const EXPECTATION_KEYWORDS = ['期待', '希望', '想', '盼', '等你', '一起', '约'];

const sanitizeText = (text = '') =>
  (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);

const getAffinityStage = (affinity) => {
  if (typeof affinity !== 'number') {
    return { label: '未定义', strategy: '默认保持礼貌与真诚，不冒进' };
  }
  if (affinity < 30) {
    return { label: '低好感（0-30）', strategy: '建立信任，保持礼貌真诚，避免过度暧昧或冒进' };
  }
  if (affinity < 70) {
    return { label: '中好感（30-70）', strategy: '适度暧昧，展示关心与幽默，逐步加深话题' };
  }
  return { label: '高好感（70+）', strategy: '可以更直接和亲密，表达心意，但尊重边界' };
};

const analyzeLastMessageEmotion = (messages = []) => {
  const last = messages[messages.length - 1];
  if (!last || !last.content) return { label: '中性', reason: '缺少有效内容' };
  const text = sanitizeText(last.content || last.text || '');
  const lower = text.toLowerCase();

  const hits = (keywords) => keywords.some((kw) => lower.includes(kw.toLowerCase()));

  if (hits(NEGATIVE_KEYWORDS)) return { label: '负面/不满', reason: '检测到负面情绪词' };
  if (hits(POSITIVE_KEYWORDS)) return { label: '正向/愉快', reason: '检测到积极情绪词' };
  if (hits(QUESTION_KEYWORDS)) return { label: '疑问/等待回应', reason: '包含疑问/提问词' };
  if (hits(EXPECTATION_KEYWORDS)) return { label: '期待/邀请', reason: '包含期待或邀请表达' };

  return { label: '中性', reason: '未命中显著情绪/提问关键词' };
};

const pickTopTraits = (traitsData, limit = 3) => {
  if (!traitsData) return [];
  try {
    let source = traitsData;
    if (typeof source === 'string') {
      source = JSON.parse(source);
    }

    if (Array.isArray(source)) {
      return source.slice(0, limit).map((item) => {
        if (typeof item === 'string') return item;
        if (item?.name) return item.name;
        return typeof item === 'object' ? Object.values(item).join('/') : String(item);
      });
    }

    if (Array.isArray(source.keywords)) {
      return source.keywords.slice(0, limit);
    }

    return [];
  } catch {
    return [];
  }
};

export function buildCharacterProfile(character, details, affinityStage) {
  if (!character) return '角色信息未知。';
  const parts = [];
  parts.push(`角色：${character.name}`);

  if (character.relationship_label) {
    parts.push(`关系：${character.relationship_label}`);
  }

  if (typeof character.affinity === 'number') {
    parts.push(`当前好感度：${character.affinity}`);
  }

  if (affinityStage?.label) {
    parts.push(`好感阶段：${affinityStage.label}`);
  }

  if (details?.personality_traits) {
    const traits = pickTopTraits(details.personality_traits);
    if (traits.length) {
      parts.push(`性格关键词：${traits.join('、')}`);
    }
  }

  if (details?.likes_dislikes) {
    try {
      const parsed = typeof details.likes_dislikes === 'string'
        ? JSON.parse(details.likes_dislikes)
        : details.likes_dislikes;
      if (parsed?.likes?.length) {
        parts.push(`喜好：${parsed.likes.slice(0, 2).join('、')}`);
      }
      if (parsed?.dislikes?.length) {
        parts.push(`忌讳：${parsed.dislikes.slice(0, 2).join('、')}`);
      }
    } catch {
      // ignore parsing errors
    }
  }

  if (Array.isArray(character.tags) && character.tags.length) {
    parts.push(`标签：${character.tags.slice(0, 3).join('、')}`);
  }

  return parts.join(' | ');
}

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000); // seconds
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
};

export function formatMessageHistory(messages = [], totalCount = null) {
  if (!messages.length) return '暂无历史消息。';

  const lines = [];

  // 如果总数大于展示数量，添加提示
  if (totalCount && totalCount > messages.length) {
    lines.push(`【对话历史（共 ${totalCount} 条，显示最近 ${messages.length} 条）】`);
  }

  messages.forEach((msg) => {
    const sender = msg.sender === 'user' ? '玩家' : '角色';
    const content = sanitizeText(msg.content || msg.text || '');
    const timeTag = formatRelativeTime(msg.timestamp);
    const prefix = timeTag ? `[${timeTag}] ` : '';
    lines.push(`${prefix}${sender}：${content}`);
  });

  return lines.join('\n');
}

export function buildSuggestionContext(db, options = {}) {
  const { conversationId, characterId, messageLimit = DEFAULT_MESSAGE_LIMIT } = options;
  if (!conversationId && !characterId) {
    throw new Error('conversationId 或 characterId 至少需要一个');
  }

  const conversation = conversationId ? db.getConversationById(conversationId) : null;
  const resolvedCharacterId = characterId || conversation?.character_id;
  const character = resolvedCharacterId ? db.getCharacterById(resolvedCharacterId) : null;
  const characterDetails = resolvedCharacterId ? db.getCharacterDetails(resolvedCharacterId) : null;
  const history = conversationId
    ? db.getRecentMessagesByConversation(conversationId, messageLimit || DEFAULT_MESSAGE_LIMIT)
    : [];

  // 获取总消息数量（用于显示提示）
  const totalMessageCount = conversationId
    ? (db.getMessagesByConversation?.(conversationId)?.length || history.length)
    : history.length;

  const affinityStage = getAffinityStage(character?.affinity);
  const emotion = analyzeLastMessageEmotion(history);

  return {
    conversation,
    character,
    characterDetails,
    history,
    totalMessageCount,
    characterProfile: buildCharacterProfile(character, characterDetails, affinityStage),
    historyText: formatMessageHistory(history, totalMessageCount),
    affinityStage,
    emotion
  };
}

