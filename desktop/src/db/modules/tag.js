export default function TagManager(BaseClass) {
  return class extends BaseClass {
    // 创建标签
    createTag(tagData) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO tags (id, name, color)
      VALUES (@id, @name, @color)
    `);

    const info = stmt.run({
      id: tagData.id || this.generateId(),
      name: tagData.name,
      color: tagData.color || 'primary'
    });

    return this.getTagById(tagData.id || info.lastInsertRowid);
  }

  // 获取所有标签
  getAllTags() {
    const stmt = this.db.prepare('SELECT * FROM tags ORDER BY name');
    return stmt.all();
  }

  // 获取单个标签
  getTagById(id) {
    const stmt = this.db.prepare('SELECT * FROM tags WHERE id = ?');
    return stmt.get(id);
  }

  // 为角色添加标签
  addTagToCharacter(characterId, tagId) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO character_tags (character_id, tag_id)
      VALUES (?, ?)
    `);

    stmt.run(characterId, tagId);
  }
  };
}