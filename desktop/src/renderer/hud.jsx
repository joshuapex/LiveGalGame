import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './hud.css';
import audioCaptureService from '../asr/audio-capture-service.js';


const HUD_SUGGESTIONS = [
  {
    title: '提议具体地点',
    body: '"我知道附近有个很棒的公园，樱花特别美，要不要去那里？"',
    badges: ['主动', '体贴']
  },
  {
    title: '表达期待',
    body: '"太好了！我一直想和你一起去散步呢。"',
    badges: ['情感', '真诚']
  }
];

const getPointerCoords = (event) => {
  const x = event.screenX !== undefined && event.screenX !== null ? event.screenX : event.clientX;
  const y = event.screenY !== undefined && event.screenY !== null ? event.screenY : event.clientY;
  return { x, y };
};

// 会话选择器组件
function SessionSelector({ onSessionSelected, onClose }) {
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
}

function Hud() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showSelector, setShowSelector] = useState(true);
  const [sessionInfo, setSessionInfo] = useState(null);
  const transcriptRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, startX: 0, startY: 0 });

  const loadMessages = useCallback(async (conversationId) => {
    setLoading(true);
    setError('');
    try {
      const api = window.electronAPI;
      if (!api || !api.getMessagesByConversation) {
        throw new Error('数据库API不可用');
      }

      const fetchedMessages = await api.getMessagesByConversation(conversationId);
      setMessages(fetchedMessages || []);
    } catch (err) {
      console.error('加载对话失败：', err);
      setError(err instanceof Error ? err.message : '加载失败');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);



  const handleSessionSelected = async (info) => {
    setSessionInfo(info);
    setShowSelector(false);
    if (info.conversationId) {
      loadMessages(info.conversationId);
    } else {
      setMessages([]);
      setLoading(false);
    }

    // 自动启动 ASR
    try {
      const api = window.electronAPI;
      if (!api?.asrGetAudioSources || !api?.asrStart) {
        console.error('ASR API not available');
        return;
      }

      // 检查音频源配置
      const audioSources = await api.asrGetAudioSources();
      console.log('所有音频源配置:', JSON.stringify(audioSources, null, 2));

      // SQLite 返回的 is_active 可能是整数 0/1，需要兼容处理
      const activeSources = audioSources.filter(source => {
        const isActive = source.is_active === 1 || source.is_active === true || source.is_active === '1';
        return isActive;
      });

      console.log('激活的音频源:', JSON.stringify(activeSources, null, 2));

      // 需要至少配置两个音频源：speaker1 (用户/麦克风) 和 speaker2 (角色/系统音频)
      const speaker1 = activeSources.find(s =>
        s.name === 'Speaker 1' ||
        s.name === 'speaker1' ||
        s.name === '用户' ||
        s.name === '用户（麦克风）'
      );

      if (!speaker1) {
        console.error('未找到麦克风配置 (speaker1)');
        setError('未找到麦克风配置，请在设置中配置音频源');
        return;
      }

      // 确保有对话 ID（如果是新对话，需要先创建）
      let conversationId = info.conversationId;
      if (!conversationId && info.characterId) {
        // 创建新对话
        if (api.dbCreateConversation) {
          const newConv = await api.dbCreateConversation({
            character_id: info.characterId,
            title: info.conversationName || '新对话'
          });
          conversationId = newConv?.id;
          if (conversationId) {
            setSessionInfo({ ...info, conversationId });
          }
        }
      }

      if (conversationId) {
        // 1. 通知主进程开始 ASR
        await api.asrStart(conversationId);

        // 2. 在渲染进程开始捕获音频
        try {
          await audioCaptureService.startCapture('speaker1', speaker1.device_id);
          console.log('Microphone capture started');
        } catch (captureError) {
          console.error('Failed to start microphone capture:', captureError);
          setError(`麦克风启动失败: ${captureError.message}`);
        }
      }
    } catch (error) {
      console.error('Error starting ASR:', error);
      setError(`启动语音识别失败：${error.message}`);
    }
  };

  const handleCloseSelector = () => {
    if (window.electronAPI?.closeHUD) {
      window.electronAPI.closeHUD();
    }
  };

  useEffect(() => {
    if (showSelector) return;
    setTimeout(() => {
      if (sessionInfo?.conversationId) {
        loadMessages(sessionInfo.conversationId);
      }
    }, 0);
  }, [showSelector, sessionInfo, loadMessages]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  // 监听 ASR 识别结果
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.on || !sessionInfo?.conversationId) return;

    // 监听完整句子识别结果
    const handleSentenceComplete = async (result) => {
      try {
        const { sourceId, text, confidence } = result;
        if (!text || !text.trim()) return;

        // speaker1 是用户（麦克风），speaker2 是角色（系统音频）
        const sender = sourceId === 'speaker1' ? 'user' : 'character';

        // 创建消息
        if (api.dbCreateMessage && sessionInfo.conversationId) {
          const newMessage = await api.dbCreateMessage({
            conversation_id: sessionInfo.conversationId,
            sender: sender,
            content: text.trim(),
            timestamp: Date.now()
          });

          if (newMessage) {
            // 更新消息列表
            setMessages(prev => [...prev, newMessage]);
          }
        }
      } catch (error) {
        console.error('Error handling ASR result:', error);
        setError(`处理识别结果失败：${error.message}`);
      }
    };

    // 监听 ASR 错误
    const handleError = (error) => {
      console.error('ASR error:', error);
      setError(`语音识别错误：${error.error || error.message || '未知错误'}`);
    };

    // 注册监听器
    api.on('asr-sentence-complete', handleSentenceComplete);
    api.on('asr-error', handleError);

    return () => {
      // 清理监听器
      api.removeListener('asr-sentence-complete', handleSentenceComplete);
      api.removeListener('asr-error', handleError);
    };
  }, [sessionInfo]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      const api = window.electronAPI;
      if (!dragStateRef.current.dragging || !api?.updateHUDDrag) return;
      const pos = getPointerCoords(event);
      api.updateHUDDrag(pos);
    };

    const handleMouseUp = () => {
      if (!dragStateRef.current.dragging) return;
      dragStateRef.current.dragging = false;
      setIsDragging(false);
      window.electronAPI?.endHUDDrag?.();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mouseleave', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseUp);
    };
  }, []);

  const handleDragStart = (event) => {
    const api = window.electronAPI;
    if (!api?.startHUDDrag) return;
    const pos = getPointerCoords(event);
    dragStateRef.current = { dragging: true, startX: pos.x, startY: pos.y };
    setIsDragging(true);
    api.startHUDDrag(pos);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClose = () => {
    if (window.electronAPI?.closeHUD) {
      window.electronAPI.closeHUD();
    }
  };

  const handleSwitchSession = () => {
    setShowSelector(true);
    setSessionInfo(null);
  };

  const renderTranscriptContent = () => {
    if (loading) {
      return (
        <div className="hud-status">
          <span className="hud-spinner" aria-hidden="true" />
          <p className="hud-status-text">加载中...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="hud-status hud-error">
          <p className="hud-status-text">加载失败：{error}</p>
        </div>
      );
    }

    if (!messages.length) {
      return (
        <div className="hud-status">
          <p className="hud-status-text">{sessionInfo?.isNew ? '新对话，开始聊天吧！' : '该对话还没有消息'}</p>
        </div>
      );
    }

    return messages.map((msg, index) => {
      const isUser = msg.sender === 'user';
      const key = msg.id ?? `${msg.sender}-${msg.timestamp ?? index}`;
      return (
        <div className={`message-item ${isUser ? 'message-user' : 'message-other'}`} key={key}>
          <div className="message-bubble">{msg.content || msg.text || ''}</div>
        </div>
      );
    });
  };

  if (showSelector) {
    return <SessionSelector onSessionSelected={handleSessionSelected} onClose={handleCloseSelector} />;
  }

  return (
    <div className="hud-container">
      <header className="hud-header">
        <div
          className={`hud-drag-zone ${isDragging ? 'hud-dragging' : ''}`}
          onMouseDown={handleDragStart}
          title="拖拽HUD"
        >
          <span className="status-indicator" />
          <span className="hud-title">{sessionInfo?.characterName || '心情助手'}</span>
        </div>
        <div className="hud-controls">
          <button className="control-btn" onClick={handleSwitchSession} title="切换会话">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
          </button>
          <button className="control-btn" onClick={handleClose} aria-label="关闭 HUD">
            ×
          </button>
        </div>
      </header>

      <section className="hud-section">
        <div className="section-label">{sessionInfo?.conversationName || '最近互动'}</div>
        <div className="transcript-area" ref={transcriptRef}>
          {renderTranscriptContent()}
        </div>
      </section>

      <section className="hud-section">
        <div className="section-label">AI 建议</div>
        <div className="suggestions-grid">
          {HUD_SUGGESTIONS.map((suggestion) => (
            <article className="suggestion-card" key={suggestion.title}>
              <div className="suggestion-header">
                <strong>{suggestion.title}</strong>
              </div>
              <p className="suggestion-body">{suggestion.body}</p>
              <div className="suggestion-meta">
                {suggestion.badges.map((badge) => (
                  <span className="suggestion-badge" key={badge}>
                    {badge}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const hudRoot = document.getElementById('hud-root');
if (hudRoot) {
  ReactDOM.createRoot(hudRoot).render(
    <React.StrictMode>
      <Hud />
    </React.StrictMode>
  );
} else {
  console.error('HUD root element not found');
}

