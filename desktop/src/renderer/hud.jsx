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
  const [showSelector, setShowSelector] = useState(true);
  const [sessionInfo, setSessionInfo] = useState(null);
  const transcriptRef = useRef(null);
  
  // 音量检测相关状态
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [systemVolumeLevel, setSystemVolumeLevel] = useState(0);
  const [hasSystemAudio, setHasSystemAudio] = useState(false);
  const audioContextRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const systemAnalyserRef = useRef(null);
  const micDataArrayRef = useRef(null);
  const systemDataArrayRef = useRef(null);
  const animationIdRef = useRef(null);
  const micStreamRef = useRef(null);
  const systemStreamRef = useRef(null);

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
      console.log('[HUD] 所有音频源配置:', JSON.stringify(audioSources, null, 2));

      // speaker1 = 用户（麦克风）
      // speaker2 = 角色（系统音频）
      const speaker1 = audioSources.find(s => s.id === 'speaker1');
      const speaker2 = audioSources.find(s => s.id === 'speaker2');

      console.log('[HUD] 找到的音频源配置:', {
        speaker1: speaker1 ? { id: speaker1.id, name: speaker1.name, device_id: speaker1.device_id, is_active: speaker1.is_active } : null,
        speaker2: speaker2 ? { id: speaker2.id, name: speaker2.name, device_id: speaker2.device_id, is_active: speaker2.is_active } : null
      });

      // 检查speaker1是否存在且激活
      if (!speaker1) {
        console.error('[HUD] 未找到麦克风配置 (speaker1)');
        setError('未找到麦克风配置，请在设置中配置音频源');
        return;
      }

      const isSpeaker1Active = speaker1.is_active === 1 || speaker1.is_active === true || speaker1.is_active === '1';
      if (!isSpeaker1Active) {
        console.error('[HUD] 麦克风配置未激活 (speaker1)');
        setError('麦克风配置未激活，请在设置中启用音频源');
        return;
      }

      if (!speaker1.device_id) {
        console.error('[HUD] 麦克风设备ID未配置 (speaker1)');
        setError('麦克风设备ID未配置，请在设置中配置音频源');
        return;
      }

      // 确保有对话 ID（如果是新对话，需要先创建）
      let conversationId = info.conversationId;
      if (!conversationId && info.characterId) {
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
          console.log('[HUD] 开始启动音频捕获...');
          
          // 启动 speaker1 (用户/麦克风)
          console.log(`[HUD] 启动 speaker1 (用户/麦克风): device=${speaker1.device_id}`);
          await audioCaptureService.startMicrophoneCapture('speaker1', speaker1.device_id);
          console.log(`[HUD] ✅ speaker1 (麦克风) 捕获已启动`);
          
          // 启动 speaker2 (角色/系统音频) - 使用 electron-audio-loopback
          let systemAudioEnabled = false;
          
          if (speaker2) {
            const isSpeaker2Active = speaker2.is_active === 1 || speaker2.is_active === true || speaker2.is_active === '1';
            if (isSpeaker2Active) {
              try {
                console.log(`[HUD] 启动 speaker2 (角色/系统音频) 使用 electron-audio-loopback`);
                await audioCaptureService.startSystemAudioCapture('speaker2');
                systemAudioEnabled = true;
                console.log(`[HUD] ✅ speaker2 (系统音频) 捕获已启动`);
              } catch (speaker2Error) {
                console.error('[HUD] ❌ speaker2 (系统音频) 捕获启动失败:', speaker2Error);
                console.warn('[HUD] ⚠️ 系统音频捕获失败，但继续运行（仅使用麦克风）');
                // 不设置错误，允许继续使用麦克风
              }
            } else {
              console.log('[HUD] Speaker2未激活，跳过系统音频捕获');
            }
          } else {
            console.log('[HUD] 未找到speaker2配置，跳过系统音频捕获');
          }
          
          // 启动音量检测
          console.log('[HUD] 启动音量检测:', { 
            micDeviceId: speaker1.device_id, 
            systemAudioEnabled
          });
          await startVolumeMonitoring(speaker1.device_id, speaker1.device_name, systemAudioEnabled);
        } catch (captureError) {
          console.error('[HUD] Failed to start audio capture:', captureError);
          setError(`音频捕获启动失败: ${captureError.message}`);
        }
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
    api.on('asr-sentence-complete', handleSentenceComplete);
    api.on('asr-sentence-update', handleSentenceUpdate);
    api.on('asr-error', handleError);

    return () => {
      // 清理监听器
      api.removeListener('asr-sentence-complete', handleSentenceComplete);
      api.removeListener('asr-sentence-update', handleSentenceUpdate);
      api.removeListener('asr-error', handleError);
    };
  }, [sessionInfo]);

  const handleClose = () => {
    if (window.electronAPI?.closeHUD) {
      window.electronAPI.closeHUD();
    }
  };

  const handleSwitchSession = () => {
    // 停止音量检测
    stopVolumeMonitoring();
    setShowSelector(true);
    setSessionInfo(null);
  };

  // 启动音量检测
  const startVolumeMonitoring = async (micDeviceId, micDeviceName, systemAudioEnabled) => {
    try {
      console.log('[VolumeMonitoring] 开始启动音量检测:', {
        micDeviceId,
        micDeviceName,
        systemAudioEnabled
      });

      // 先停止之前的检测
      stopVolumeMonitoring();

      // 等待一小段时间确保 audioCaptureService 已完全启动
      await new Promise(resolve => setTimeout(resolve, 500));

      // 使用 audioCaptureService 的 AudioContext，避免冲突
      if (!audioContextRef.current) {
        // 尝试复用 audioCaptureService 的 AudioContext
        if (audioCaptureService.audioContext && audioCaptureService.audioContext.state !== 'closed') {
          audioContextRef.current = audioCaptureService.audioContext;
          console.log('[VolumeMonitoring] 复用 audioCaptureService 的 AudioContext');
        } else {
          // 如果 audioCaptureService 的 AudioContext 不可用，创建新的
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          console.log('[VolumeMonitoring] 创建新的 AudioContext (audioCaptureService 的 AudioContext 不可用)');
        }
      }

      // 从 audioCaptureService 获取麦克风流
      const micStream = audioCaptureService.streams.get('speaker1');
      if (!micStream) {
        throw new Error('无法获取麦克风流，audioCaptureService 可能未正确启动');
      }

      console.log('[VolumeMonitoring] 从 audioCaptureService 获取麦克风流');

      // 创建麦克风分析器
      const micAnalyser = audioContextRef.current.createAnalyser();
      micAnalyser.fftSize = 256;
      micAnalyser.smoothingTimeConstant = 0.8;
      micAnalyserRef.current = micAnalyser;
      micDataArrayRef.current = new Uint8Array(micAnalyser.frequencyBinCount);

      micStreamRef.current = micStream;

      const micSource = audioContextRef.current.createMediaStreamSource(micStream);
      micSource.connect(micAnalyser);
      console.log('[VolumeMonitoring] 用户音量检测已启动');

      // 如果启用了系统音频，从 audioCaptureService 获取流进行音量检测
      if (systemAudioEnabled) {
        console.log('[VolumeMonitoring] 配置系统音频检测');

        // 再次等待确保系统音频流已准备好
        await new Promise(resolve => setTimeout(resolve, 1000));

        const systemStream = audioCaptureService.streams.get('speaker2');
        if (systemStream) {
          try {
            const systemAnalyser = audioContextRef.current.createAnalyser();
            systemAnalyser.fftSize = 256;
            systemAnalyser.smoothingTimeConstant = 0.8;
            systemAnalyserRef.current = systemAnalyser;
            systemDataArrayRef.current = new Uint8Array(systemAnalyser.frequencyBinCount);

            systemStreamRef.current = systemStream;
            const systemSource = audioContextRef.current.createMediaStreamSource(systemStream);
            systemSource.connect(systemAnalyser);
            setHasSystemAudio(true);
            console.log('[VolumeMonitoring] 角色音量检测已启动');
          } catch (systemError) {
            console.warn('[VolumeMonitoring] 系统音频音量检测失败:', systemError);
            setHasSystemAudio(false);
          }
        } else {
          console.warn('[VolumeMonitoring] 未找到系统音频流，系统音频可能未正确启动');
          setHasSystemAudio(false);
        }
      } else {
        console.log('[VolumeMonitoring] 系统音频未启用，跳过角色音量检测');
        setHasSystemAudio(false);
      }

      // 开始分析音量
      console.log('[VolumeMonitoring] 开始音量分析循环');
      analyzeVolume();
    } catch (error) {
      console.error('[VolumeMonitoring] 启动音量检测失败:', error);
      setError(`音量检测启动失败: ${error.message}`);
    }
  };

  // 停止音量检测
  const stopVolumeMonitoring = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    // 停止媒体流
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(track => track.stop());
      systemStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setMicVolumeLevel(0);
    setSystemVolumeLevel(0);
    setHasSystemAudio(false);
  };

  // 分析音量
  const analyzeVolume = () => {
    // 分析麦克风音量
    if (micAnalyserRef.current && micDataArrayRef.current) {
      micAnalyserRef.current.getByteFrequencyData(micDataArrayRef.current);
      let micSum = 0;
      for (let i = 0; i < micDataArrayRef.current.length; i++) {
        micSum += micDataArrayRef.current[i];
      }
      const micAverage = micSum / micDataArrayRef.current.length;
      const micVolume = Math.min(100, (micAverage / 255) * 100);
      setMicVolumeLevel(micVolume);
    }

    // 分析系统音频音量
    if (systemAnalyserRef.current && systemDataArrayRef.current) {
      systemAnalyserRef.current.getByteFrequencyData(systemDataArrayRef.current);
      let systemSum = 0;
      for (let i = 0; i < systemDataArrayRef.current.length; i++) {
        systemSum += systemDataArrayRef.current[i];
      }
      const systemAverage = systemSum / systemDataArrayRef.current.length;
      const systemVolume = Math.min(100, (systemAverage / 255) * 100);
      setSystemVolumeLevel(systemVolume);
    }

    animationIdRef.current = requestAnimationFrame(analyzeVolume);
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopVolumeMonitoring();
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
          className="hud-drag-zone"
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
            </div>
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

