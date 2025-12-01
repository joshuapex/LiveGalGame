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
  const [streamingMessages, setStreamingMessages] = useState({});
  // 临时禁用streaming功能以修复HUD关闭问题
  const streamingDisabled = true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSelector, setShowSelector] = useState(true);
  const [sessionInfo, setSessionInfo] = useState(null);
  const transcriptRef = useRef(null);

  // 音量检测相关状态
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [systemVolumeLevel, setSystemVolumeLevel] = useState(0);
  const [hasSystemAudio, setHasSystemAudio] = useState(false);
  const [systemAudioNotAuthorized, setSystemAudioNotAuthorized] = useState(false); // 系统音频未授权提示
  const [isListening, setIsListening] = useState(false);

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

    // 确保有对话 ID（如果是新对话，需要先创建）
    let conversationId = info.conversationId;
    if (!conversationId && info.characterId) {
      const api = window.electronAPI;
      if (api && api.dbCreateConversation) {
        try {
          const newConv = await api.dbCreateConversation({
            character_id: info.characterId,
            title: info.conversationName || '新对话'
          });
          conversationId = newConv?.id;
          if (conversationId) {
            setSessionInfo({ ...info, conversationId });
          }
        } catch (err) {
          console.error('创建新对话失败:', err);
          setError('创建新对话失败');
        }
      }
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      // 停止监听
      try {
        await audioCaptureService.stopAllCaptures();
        const api = window.electronAPI;
        if (api?.asrStop) {
          await api.asrStop();
        }
        setIsListening(false);
        setMicVolumeLevel(0);
        setSystemVolumeLevel(0);
      } catch (err) {
        console.error('停止监听失败:', err);
      }
      return;
    }

    // 开始监听
    try {
      const api = window.electronAPI;
      if (!api?.asrGetAudioSources || !api?.asrStart) {
        console.error('ASR API not available');
        return;
      }

      const conversationId = sessionInfo?.conversationId;
      if (!conversationId) {
        setError('未找到有效的对话ID');
        return;
      }

      // 检查音频源配置
      const audioSources = await api.asrGetAudioSources();
      const speaker1 = audioSources.find(s => s.id === 'speaker1');
      const speaker2 = audioSources.find(s => s.id === 'speaker2');

      // 检查speaker1是否存在且激活
      if (!speaker1) {
        setError('未找到麦克风配置，请在设置中配置音频源');
        return;
      }

      const isSpeaker1Active = speaker1.is_active === 1 || speaker1.is_active === true || speaker1.is_active === '1';
      if (!isSpeaker1Active) {
        setError('麦克风配置未激活，请在设置中启用音频源');
        return;
      }

      if (!speaker1.device_id) {
        setError('麦克风设备ID未配置，请在设置中配置音频源');
        return;
      }

      // 1. 通知主进程开始 ASR
      await api.asrStart(conversationId);

      // 2. 在渲染进程开始捕获音频
      try {
        console.log('[HUD] 开始启动音频捕获...');

        // 启动 speaker1 (用户/麦克风)
        await audioCaptureService.startMicrophoneCapture('speaker1', speaker1.device_id);

        // 启动 speaker2 (角色/系统音频)
        let systemAudioEnabled = false;
        if (speaker2) {
          const isSpeaker2Active = speaker2.is_active === 1 || speaker2.is_active === true || speaker2.is_active === '1';
          if (isSpeaker2Active) {
            try {
              // 尝试启动系统音频捕获 (如果缓存不可用，会尝试获取新流，可能弹出选择器)
              await audioCaptureService.startSystemAudioCapture('speaker2');
              systemAudioEnabled = true;
              setSystemAudioNotAuthorized(false);
            } catch (speaker2Error) {
              console.error('[HUD] ❌ speaker2 (系统音频) 启动失败:', speaker2Error);
              setSystemAudioNotAuthorized(true);
            }
          }
        }

        setHasSystemAudio(systemAudioEnabled);
        setIsListening(true);
        setError(''); // 清除之前的错误
      } catch (captureError) {
        console.error('[HUD] Failed to start audio capture:', captureError);
        setError(`音频捕获启动失败: ${captureError.message}`);
        // 如果启动失败，尝试停止已启动的部分
        await audioCaptureService.stopAllCaptures();
      }
    } catch (error) {
      console.error('[HUD] Error starting ASR:', error);
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

  const updateStreamingMessage = useCallback((sourceId, sender, content, timestamp) => {
    if (!sourceId || !content) return;
    setStreamingMessages(prev => ({
      ...prev,
      [sourceId]: {
        id: `stream-${sourceId}`,
        sender,
        content,
        timestamp: timestamp || Date.now()
      }
    }));
  }, []);

  const clearStreamingMessage = useCallback((sourceId) => {
    if (!sourceId) return;
    setStreamingMessages(prev => {
      if (!prev[sourceId]) return prev;
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
  }, []);

  // 监听 ASR 识别结果
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.on || !sessionInfo?.conversationId) return;

    // 监听完整句子识别结果（新消息）
    const handleSentenceComplete = (message) => {
      try {
        if (!message) return;

        // 兼容旧格式（result.text）
        if (!message.id && message.text) {
          const normalized = (message.text || '').trim();
          if (!normalized) return;
          const sender = message.sourceId === 'speaker1' ? 'user' : 'character';
          setMessages(prev => [...prev, {
            id: `${Date.now()}`,
            conversation_id: sessionInfo.conversationId,
            sender,
            content: normalized,
            timestamp: Date.now()
          }]);
          return;
        }

        // 默认：ASRManager 已经写入数据库并返回 message 记录
        setMessages(prev => [...prev, message]);
        // 清除对应的streaming消息
        setStreamingMessages(prev => {
          const newState = { ...prev };
          delete newState[message.source_id];
          return newState;
        });
      } catch (error) {
        console.error('Error handling ASR result:', error);
        setError(`处理识别结果失败：${error.message}`);
      }
    };

    // 监听消息更新事件（更新现有消息内容）
    const handleSentenceUpdate = (updatedMessage) => {
      try {
        if (!updatedMessage || !updatedMessage.id) return;

        setMessages(prev => prev.map(msg =>
          msg.id === updatedMessage.id
            ? { ...msg, content: updatedMessage.content }
            : msg
        ));
      } catch (error) {
        console.error('Error handling ASR update:', error);
      }
    };

    // 监听 ASR 错误
    const handleError = (error) => {
      console.error('ASR error:', error);
      setError(`语音识别错误：${error.error || error.message || '未知错误'}`);
    };

    // 注册监听器
    const handlePartialUpdate = (payload) => {
      try {
        const sourceId = payload?.sourceId || payload?.sessionId;
        const content = payload?.content;
        if (!sourceId || !content) return;
        const sender = sourceId === 'speaker1' ? 'user' : 'character';
        updateStreamingMessage(sourceId, sender, content, payload?.timestamp);
      } catch (error) {
        console.error('Error handling partial update:', error);
      }
    };

    const handlePartialClear = (payload) => {
      try {
        const sourceId = payload?.sourceId || payload?.sessionId;
        if (!sourceId) return;
        clearStreamingMessage(sourceId);
      } catch (error) {
        console.error('Error clearing partial message:', error);
      }
    };

    api.on('asr-sentence-complete', handleSentenceComplete);
    api.on('asr-sentence-update', handleSentenceUpdate);
    api.on('asr-error', handleError);
    // 临时禁用streaming事件监听
    if (!streamingDisabled) {
      api.on('asr-partial-update', handlePartialUpdate);
      api.on('asr-partial-clear', handlePartialClear);
    }

    return () => {
      // 清理监听器
      api.removeListener('asr-sentence-complete', handleSentenceComplete);
      api.removeListener('asr-sentence-update', handleSentenceUpdate);
      api.removeListener('asr-error', handleError);
      if (!streamingDisabled) {
        api.removeListener('asr-partial-update', handlePartialUpdate);
        api.removeListener('asr-partial-clear', handlePartialClear);
      }
    };
  }, [sessionInfo?.conversationId]); // 只依赖会话ID，避免函数引用变化导致的重新注册

  const handleClose = () => {
    if (window.electronAPI?.closeHUD) {
      window.electronAPI.closeHUD();
    }
  };

  const handleSwitchSession = () => {
    setShowSelector(true);
    setSessionInfo(null);
  };

  // 监听音量更新事件
  useEffect(() => {
    const handleVolumeUpdate = ({ sourceId, volume }) => {
      if (sourceId === 'speaker1') {
        setMicVolumeLevel(volume);
      } else if (sourceId === 'speaker2') {
        setSystemVolumeLevel(volume);
      }
    };

    audioCaptureService.on('volume-update', handleVolumeUpdate);

    return () => {
      audioCaptureService.off('volume-update', handleVolumeUpdate);
    };
  }, []);

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
      // 检查是否是系统音频捕获失败的错误（不应该阻止应用运行）
      const isSystemAudioError = error.includes('系统音频捕获失败');

      return (
        <div className={`hud-status ${isSystemAudioError ? 'hud-warning' : 'hud-error'}`}>
          <p className="hud-status-text" style={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
            {isSystemAudioError ? '⚠️ ' : '❌ '}{error}
          </p>
        </div>
      );
    }

    if (!messages.length) {
      return (
        <div className="hud-status">
          <p className="hud-status-text">
            {isListening ? (sessionInfo?.isNew ? '新对话，开始聊天吧！' : '该对话还没有消息') : '点击上方播放按钮开始监听'}
          </p>
        </div>
      );
    }

    const streamingItems = streamingDisabled ? [] : Object.values(streamingMessages);
    return (
      <>
        {messages.map((msg, index) => {
          const isUser = msg.sender === 'user';
          const key = msg.id ?? `${msg.sender}-${msg.timestamp ?? index}`;
          return (
            <div className={`message-item ${isUser ? 'message-user' : 'message-other'}`} key={key}>
              <div className="message-bubble">{msg.content || msg.text || ''}</div>
            </div>
          );
        })}
        {!streamingDisabled && streamingItems.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div className={`message-item ${isUser ? 'message-user' : 'message-other'} message-streaming`} key={msg.id}>
              <div className="message-bubble">
                {msg.content}
                <span className="message-streaming-indicator">…</span>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  if (showSelector) {
    return <SessionSelector onSessionSelected={handleSessionSelected} onClose={handleCloseSelector} />;
  }

  return (
    <div className="hud-container">
      <header className="hud-header">
        <div
          className="hud-drag-zone"
          title="拖拽HUD"
        >
          <span className="status-indicator" />
          <span className="hud-title">{sessionInfo?.characterName || '心情助手'}</span>
        </div>
        <div className="hud-controls">
          <button
            className={`control-btn ${isListening ? 'listening' : ''}`}
            onClick={toggleListening}
            title={isListening ? "停止监听" : "开始监听"}
            style={{ color: isListening ? '#ff4d4f' : '#52c41a', marginRight: '8px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isListening ? (
                <rect x="6" y="4" width="4" height="16"></rect>
              ) : (
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              )}
              {isListening && <rect x="14" y="4" width="4" height="16"></rect>}
            </svg>
          </button>
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

        {/* 音量显示 */}
        {sessionInfo && (
          <div className="volume-indicators">
            <div className="volume-item">
              <span className="volume-label">用户</span>
              <div className="volume-bar-container">
                <div
                  className="volume-bar volume-bar-mic"
                  style={{ width: `${micVolumeLevel}%` }}
                />
              </div>
              <span className="volume-value">{micVolumeLevel.toFixed(0)}%</span>
            </div>
            <div className="volume-item">
              <span className="volume-label">角色</span>
              <div className="volume-bar-container">
                <div
                  className="volume-bar volume-bar-system"
                  style={{ width: `${systemVolumeLevel}%` }}
                />
              </div>
              <span className="volume-value">{systemVolumeLevel.toFixed(0)}%</span>
              {systemAudioNotAuthorized && (
                <span className="volume-warning" title="系统音频未授权，请先在设置页面测试音频">⚠️</span>
              )}
            </div>
            {systemAudioNotAuthorized && (
              <div className="system-audio-hint">
                💡 系统音频未授权，请检查设置
              </div>
            )}
          </div>
        )}
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

