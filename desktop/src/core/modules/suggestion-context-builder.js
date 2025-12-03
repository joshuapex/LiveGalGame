const DEFAULT_MESSAGE_LIMIT = 10;
const MAX_MESSAGE_CHARS = 320;

const sanitizeText = (text = '') =>
  (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);

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

export function buildCharacterProfile(character, details) {
  if (!character) return '角色信息未知。';
  const parts = [];
  parts.push(`角色：${character.name}`);

  if (character.relationship_label) {
    parts.push(`关系：${character.relationship_label}`);
  }

  if (typeof character.affinity === 'number') {
    parts.push(`当前好感度：${character.affinity}`);
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

export function formatMessageHistory(messages = []) {
  if (!messages.length) return '暂无历史消息。';
  return messages
    .map((msg) => {
      const sender = msg.sender === 'user' ? '玩家' : '角色';
      const content = sanitizeText(msg.content || msg.text || '');
      return `${sender}：${content}`;
    })
    .join('\n');
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

  return {
    conversation,
    character,
    characterDetails,
    history,
    characterProfile: buildCharacterProfile(character, characterDetails),
    historyText: formatMessageHistory(history)
  };
}

