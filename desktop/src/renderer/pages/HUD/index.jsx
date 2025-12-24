import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../../hud.css';
import audioCaptureService from '../../asr/audio-capture-service.js';

// Hooks
import { useChatSession } from '../../hooks/useChatSession.js';
import { useMessages } from '../../hooks/useMessages.js';
import { useSuggestions } from '../../hooks/useSuggestions.js';

// Components
import { SessionSelector } from './SessionSelector.jsx';
import { TranscriptView } from '../../components/Chat/TranscriptView.jsx';
import { SuggestionsPanel } from '../../components/Chat/SuggestionsPanel.jsx';

const getPointerCoords = (event) => {
  const x = event.screenX !== undefined && event.screenX !== null ? event.screenX : event.clientX;
  const y = event.screenY !== undefined && event.screenY !== null ? event.screenY : event.clientY;
  return { x, y };
};

function Hud() {
  // 使用自定义Hooks
  const chatSession = useChatSession();
  const messages = useMessages(chatSession.sessionInfo?.conversationId);
  const suggestions = useSuggestions(chatSession.sessionInfo);

  // 音量检测相关状态
  const [micVolumeLevel, setMicVolumeLevel] = React.useState(0);
  const [systemVolumeLevel, setSystemVolumeLevel] = React.useState(0);
  const [hasSystemAudio, setHasSystemAudio] = React.useState(false);
  const [systemAudioNotAuthorized, setSystemAudioNotAuthorized] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);

  // 临时禁用streaming功能
  const streamingDisabled = true;

  // 确保有可用对话ID（缺失时自动创建并回写）
  const ensureConversationId = async () => {
    let conversationId = chatSession.sessionInfo?.conversationId;
    if (conversationId) return conversationId;

    const api = window.electronAPI;
    const characterId = chatSession.sessionInfo?.characterId;
    if (!api?.dbCreateConversation || !characterId) return null;

    try {
      const newConv = await api.dbCreateConversation({
        character_id: characterId,
        title: chatSession.sessionInfo?.conversationName || '新对话'
      });
      conversationId = newConv?.id;
      if (conversationId) {
        await chatSession.handleSessionSelected({
          ...chatSession.sessionInfo,
          conversationId,
          conversationName: newConv?.title || chatSession.sessionInfo?.conversationName,
          isNew: false
        });
      }
      return conversationId;
    } catch (err) {
      console.error('[HUD] 创建对话失败:', err);
      return null;
    }
  };

  // 对齐设置页：自动兜底音源配置
  const prepareAudioSources = async () => {
    const api = window.electronAPI;
    if (!api?.asrGetAudioSources) {
      throw new Error('ASR 音频源接口不可用');
    }

    let audioSources = await api.asrGetAudioSources();
    let speaker1 = audioSources.find(s => s.id === 'speaker1');
    let speaker2 = audioSources.find(s => s.id === 'speaker2');

    // 若未配置或缺失设备ID，枚举麦克风并写入
    if (!speaker1 || !speaker1.device_id) {
      const devices = await audioCaptureService.enumerateDevices();
      if (!devices || devices.length === 0) {
        throw new Error('未找到可用麦克风设备，请先在系统中确认设备连接');
      }

      const firstDevice = devices[0];
      const payload = {
        id: 'speaker1',
        name: '用户（麦克风）',
        device_id: firstDevice.deviceId,
        device_name: firstDevice.label || firstDevice.deviceId,
        is_active: 1
      };

      if (speaker1) {
        await api.asrUpdateAudioSource('speaker1', payload);
      } else if (api.asrCreateAudioSource) {
        await api.asrCreateAudioSource(payload);
      }
      speaker1 = payload;
    }

    // 确保系统音频源有默认记录
    if (!speaker2 && api.asrCreateAudioSource) {
      try {
        await api.asrCreateAudioSource({
          id: 'speaker2',
          name: '角色（系统音频）',
          device_id: 'system-loopback',
          device_name: '系统音频（屏幕捕获）',
          is_active: 0
        });
      } catch (err) {
        console.warn('[HUD] 创建系统音频源失败:', err);
      }
    }

    // 使用最新状态
    audioSources = await api.asrGetAudioSources();
    speaker1 = audioSources.find(s => s.id === 'speaker1') || speaker1;
    speaker2 = audioSources.find(s => s.id === 'speaker2') || speaker2;

    const isSpeaker1Active = speaker1 && (speaker1.is_active === 1 || speaker1.is_active === true || speaker1.is_active === '1');
    if (!isSpeaker1Active) {
      throw new Error('麦克风配置未激活，请在设置中启用音频源');
    }
    if (!speaker1?.device_id) {
      throw new Error('麦克风设备ID未配置，请在设置中配置音频源');
    }

    return { speaker1, speaker2 };
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

      const conversationId = await ensureConversationId();
      if (!conversationId) {
        chatSession.setError('未找到有效的对话ID');
        return;
      }

      const { speaker1, speaker2 } = await prepareAudioSources();

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
        chatSession.setError(''); // 清除之前的错误
      } catch (captureError) {
        console.error('[HUD] Failed to start audio capture:', captureError);
        chatSession.setError(`音频捕获启动失败: ${captureError.message}`);
        // 如果启动失败，尝试停止已启动的部分
        await audioCaptureService.stopAllCaptures();
      }
    } catch (error) {
      console.error('[HUD] Error starting ASR:', error);
      chatSession.setError(`启动语音识别失败：${error.message}`);
    }
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

  // 监听来自消息系统的新消息事件
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.on) return;

    const handleNewMessage = (message) => {
      suggestions.handleNewMessage(message);
    };

    api.on('asr-sentence-complete', handleNewMessage);

    return () => {
      api.removeListener('asr-sentence-complete', handleNewMessage);
    };
  }, [suggestions]);

  if (chatSession.sessionInfo && chatSession.sessionInfo.conversationId) {
    messages.loadMessages();
  }

  if (chatSession.sessionInfo && chatSession.sessionInfo.conversationId) {
    useEffect(() => {
      messages.loadMessages();
    }, [chatSession.sessionInfo.conversationId]);
  }

  if (chatSession.showSelector !== false && !chatSession.sessionInfo) {
    chatSession.showSelector = true;
  }

  if (chatSession.showSelector || !chatSession.sessionInfo) {
    return <SessionSelector onSessionSelected={chatSession.handleSessionSelected} onClose={chatSession.handleClose} />;
  }

  return (
    <div className="hud-container">
      <header className="hud-header">
        <div
          className="hud-drag-zone"
          title="拖拽HUD"
        >
          <span className="status-indicator" />
          <span className="hud-title">{chatSession.sessionInfo?.characterName || '心情助手'}</span>
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
          <button className="control-btn" onClick={chatSession.handleSwitchSession} title="切换会话">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
          </button>
          <button className="control-btn" onClick={chatSession.handleClose} aria-label="关闭 HUD">
            ×
          </button>
        </div>
      </header>

      <section className="hud-section">
        <div className="section-label">{chatSession.sessionInfo?.conversationName || '最近互动'}</div>
        <TranscriptView
          messages={messages.messages}
          loading={messages.loading}
          error={chatSession.error || messages.error}
          isListening={isListening}
          isNew={chatSession.sessionInfo?.isNew}
          transcriptRef={messages.transcriptRef}
        />
      </section>

      <SuggestionsPanel
        suggestions={suggestions.suggestions}
        suggestionMeta={suggestions.suggestionMeta}
        suggestionStatus={suggestions.suggestionStatus}
        suggestionError={suggestions.suggestionError}
        PASSIVE_REASON_LABEL={suggestions.PASSIVE_REASON_LABEL}
        copiedSuggestionId={suggestions.copiedSuggestionId}
        onGenerate={suggestions.handleGenerateSuggestions}
        onCopy={suggestions.handleCopySuggestion}
        onSelectSuggestion={suggestions.handleSelectSuggestion}
        suggestionConfig={suggestions.suggestionConfig}
        onTogglePassive={(enabled) => suggestions.updateSuggestionConfig({ enable_passive_suggestion: enabled ? 1 : 0 })}
        sessionInfo={chatSession.sessionInfo}
      />
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
