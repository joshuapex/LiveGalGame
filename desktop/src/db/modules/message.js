export default function MessageManager(BaseClass) {
  return class extends BaseClass {
    // 创建消息
    createMessage(messageData) {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, sender, content, timestamp, is_ai_generated)
      VALUES (@id, @conversation_id, @sender, @content, @timestamp, @is_ai_generated)
    `);

    const messageId = messageData.id || this.generateId();

    stmt.run({
      id: messageId,
      conversation_id: messageData.conversation_id,
      sender: messageData.sender, // 'user' or 'character'
      content: messageData.content,
      timestamp: messageData.timestamp || Date.now(),
      is_ai_generated: messageData.is_ai_generated ? 1 : 0
    });

    return this.getMessageById(messageId);
  }

  // 获取对话的所有消息
  getMessagesByConversation(conversationId) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(conversationId);
  }

  // 获取对话的最近消息（用于上下文构建）
  getRecentMessagesByConversation(conversationId, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT *
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(conversationId, limit || 10);
    return rows.reverse();
  }

  // 获取单个消息
  getMessageById(id) {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    return stmt.get(id);
  }

  // 更新消息
  updateMessage(id, updates) {
    const allowedFields = ['content'];
    const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

    if (updateFields.length === 0) {
      return this.getMessageById(id);
    }

    const setClause = updateFields.map(field => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(`
      UPDATE messages
      SET ${setClause}
      WHERE id = @id
    `);

    const params = { id };
    updateFields.forEach(field => {
      params[field] = updates[field];
    });

    stmt.run(params);
    return this.getMessageById(id);
  }

  // 获取消息总数
  getMessageCount() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM messages');
    return stmt.get().count;
  }
  };
}