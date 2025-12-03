/**
 * 会话选择器组件
 */

import React, { useState, useEffect } from 'react';

export const SessionSelector = ({ onSessionSelected, onClose }) => {
  const [characters, setCharacters] = useState([]);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    loadCharacters();
  }, []);

  const loadCharacters = async () => {
    try {
      setLoading(true);
      const api = window.electronAPI;
      if (!api || !api.getAllCharacters) {
        throw new Error('数据库API不可用');
      }
      const chars = await api.getAllCharacters();
      setCharacters(chars || []);
    } catch (err) {
      console.error('加载角色失败：', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterSelect = async (character) => {
    setSelectedCharacter(character);
    setCharacterLoading(true);
    try {
      const api = window.electronAPI;
      const convs = await api.getConversationsByCharacter(character.id);
      setConversations(convs || []);
    } catch (err) {
      console.error('加载会话失败：', err);
      setConversations([]);
    } finally {
      setCharacterLoading(false);
    }
  };

  const handleContinueConversation = (conversation) => {
    onSessionSelected({
      characterId: selectedCharacter.id,
      conversationId: conversation.id,
      conversationName: conversation.title || conversation.name || '未命名对话',
      characterName: selectedCharacter.name,
      isNew: false
    });
  };

  const handleStartEdit = (conversation, e) => {
    e.stopPropagation();
    setEditingConversationId(conversation.id);
    setEditingTitle(conversation.title || conversation.name || '');
  };

  const handleSaveEdit = async (conversationId, e) => {
    e.stopPropagation();
    try {
      const api = window.electronAPI;
      if (!api || !api.updateConversation) {
        throw new Error('数据库API不可用');
      }

      const updated = await api.updateConversation(conversationId, {
        title: editingTitle.trim() || '未命名对话'
      });

      if (updated) {
        // 更新本地状态
        setConversations(prev => prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, title: updated.title }
            : conv
        ));
      }

      setEditingConversationId(null);
      setEditingTitle('');
    } catch (err) {
      console.error('保存会话标题失败：', err);
      alert('保存失败，请重试');
    }
  };

  const handleCancelEdit = (e) => {
    e.stopPropagation();
    setEditingConversationId(null);
    setEditingTitle('');
  };

  const handleCreateNewConversation = async () => {
    try {
      const timestamp = new Date().toLocaleString('zh-CN');
      const conversationName = `与 ${selectedCharacter.name} 的新对话 - ${timestamp}`;

      onSessionSelected({
        characterId: selectedCharacter.id,
        conversationId: null,
        conversationName: conversationName,
        characterName: selectedCharacter.name,
        isNew: true
      });
    } catch (err) {
      console.error('创建新会话失败：', err);
    }
  };

  const getAvatarGradient = (color) => {
    if (color?.includes('ff6b6b')) return 'bg-gradient-to-br from-[#ff6b6b] to-[#ff8e8e]';
    if (color?.includes('4ecdc4')) return 'bg-gradient-to-br from-[#4ecdc4] to-[#6ee5dd]';
    if (color?.includes('ffe66d')) return 'bg-gradient-to-br from-[#ffe66d] to-[#fff099]';
    return 'bg-gradient-to-br from-primary to-[#8e24aa]';
  };

  if (loading) {
    return (
      <div className="selector-container">
        <div className="hud-status">
          <span className="hud-spinner" aria-hidden="true" />
          <p className="hud-status-text">加载角色列表中...</p>
        </div>
      </div>
    );
  }

  if (!selectedCharacter) {
    return (
      <div className="selector-container">
        <div className="hud-header">
          <div className="hud-title-section">
            <span className="status-indicator" />
            <span className="hud-title">选择聊天对象</span>
          </div>
          <button className="control-btn" onClick={onClose} aria-label="关闭 HUD">
            ×
          </button>
        </div>
        <div className="selector-content">
          <div className="section-label">选择角色开始对话</div>
          {characters.length === 0 ? (
            <div className="hud-status">
              <p className="hud-status-text">暂无角色数据</p>
            </div>
          ) : (
            <div className="character-grid">
              {characters.map((character) => {
                const firstLetter = character.name.charAt(0);
                const avatarGradient = getAvatarGradient(character.avatar_color);
                return (
                  <div
                    key={character.id}
                    className="character-card"
                    onClick={() => handleCharacterSelect(character)}
                  >
                    <div className={`character-avatar ${avatarGradient}`}>
                      {firstLetter}
                    </div>
                    <div className="character-info">
                      <h3 className="character-name">{character.name}</h3>
                      <p className="character-relationship">{character.relationship_label}</p>
                      <div className="character-stats">
                        <span className="affinity-label">好感度</span>
                        <span className="affinity-value">{character.affinity}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="selector-container">
      <div className="hud-header">
        <div className="hud-title-section">
          <span className="status-indicator" />
          <span className="hud-title">{selectedCharacter.name}</span>
        </div>
        <button className="control-btn" onClick={onClose} aria-label="关闭 HUD">
          ×
        </button>
      </div>
      <div className="selector-content">
        <button className="back-button" onClick={() => setSelectedCharacter(null)}>
          ← 重新选择角色
        </button>

        <div className="section-label">选择会话</div>

        <button className="new-conversation-btn" onClick={handleCreateNewConversation}>
          <span className="new-conversation-icon">+</span>
          <span>创建新对话</span>
        </button>

        {characterLoading ? (
          <div className="hud-status">
            <span className="hud-spinner" aria-hidden="true" />
            <p className="hud-status-text">加载会话列表中...</p>
          </div>
        ) : conversations.length === 0 ? (
          <div className="no-conversations">
            <p className="no-conversations-text">还没有对话记录</p>
            <p className="no-conversations-hint">点击上方按钮创建新对话</p>
          </div>
        ) : (
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="conversation-item"
                onClick={() => {
                  if (editingConversationId !== conversation.id) {
                    handleContinueConversation(conversation);
                  }
                }}
              >
                <div className="conversation-info">
                  {editingConversationId === conversation.id ? (
                    <div className="conversation-edit-form">
                      <input
                        type="text"
                        className="conversation-title-input"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(conversation.id, e);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit(e);
                          }
                        }}
                        autoFocus
                      />
                      <div className="conversation-edit-actions">
                        <button
                          className="edit-btn save-btn"
                          onClick={(e) => handleSaveEdit(conversation.id, e)}
                          title="保存"
                        >
                          ✓
                        </button>
                        <button
                          className="edit-btn cancel-btn"
                          onClick={handleCancelEdit}
                          title="取消"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4
                        className="conversation-name"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(conversation, e);
                        }}
                        title="双击编辑标题"
                      >
                        {conversation.title || conversation.name || '未命名对话'}
                      </h4>
                      <p className="conversation-meta">
                        {new Date(conversation.created_at).toLocaleDateString('zh-CN')}
                        {conversation.message_count > 0 && ` • ${conversation.message_count} 条消息`}
                      </p>
                    </>
                  )}
                </div>
                {editingConversationId !== conversation.id && (
                  <div className="conversation-arrow">→</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};