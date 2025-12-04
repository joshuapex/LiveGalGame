import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './hud.css';
import audioCaptureService from "../asr/audio-capture-service.js";
// Hooks
import { useChatSession } from './hooks/useChatSession.js';
import { useMessages } from './hooks/useMessages.js';
import { useSuggestions } from './hooks/useSuggestions.js';

// Components
import { SessionSelector } from "./pages/HUD/SessionSelector.jsx";
import { CompactHud } from './components/Chat/CompactHud.jsx';
import { FullHud } from './components/Chat/FullHud.jsx';

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
  const [showSelector, setShowSelector] = React.useState(true);
  const [viewMode, setViewMode] = React.useState('full'); // full | compact


  // 临时禁用streaming功能
  const streamingDisabled = true;

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

      const conversationId = chatSession.sessionInfo?.conversationId;
      if (!conversationId) {
        chatSession.setError('未找到有效的对话ID');
        return;
      }

      // 检查音频源配置
      const audioSources = await api.asrGetAudioSources();
      const speaker1 = audioSources.find(s => s.id === 'speaker1');
      const speaker2 = audioSources.find(s => s.id === 'speaker2');

      // 检查speaker1是否存在且激活
      if (!speaker1) {
        chatSession.setError('未找到麦克风配置，请在设置中配置音频源');
        return;
      }

      const isSpeaker1Active = speaker1.is_active === 1 || speaker1.is_active === true || speaker1.is_active === '1';
      if (!isSpeaker1Active) {
        chatSession.setError('麦克风配置未激活，请在设置中启用音频源');
        return;
      }

      if (!speaker1.device_id) {
        chatSession.setError('麦克风设备ID未配置，请在设置中配置音频源');
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

  useEffect(() => {
    if (chatSession.sessionInfo?.conversationId) {
      messages.loadMessages();
    }
  }, [chatSession.sessionInfo?.conversationId]);

  useEffect(() => {
    if (chatSession.sessionInfo) {
      setShowSelector(false);
    }
  }, [chatSession.sessionInfo]);

  const handleSwitchSession = () => {
    setShowSelector(true);
    setViewMode('full');
    chatSession.handleSwitchSession();
  };

  const handleToggleViewMode = () => {
    setViewMode((prev) => (prev === 'full' ? 'compact' : 'full'));
  };

  if (showSelector) {
    return <SessionSelector onSessionSelected={chatSession.handleSessionSelected} onClose={chatSession.handleClose} />;
  }

  if (viewMode === 'compact') {
    return (
      <CompactHud
        isListening={isListening}
        micVolumeLevel={micVolumeLevel}
        systemVolumeLevel={systemVolumeLevel}
        suggestions={suggestions.suggestions}
        suggestionStatus={suggestions.suggestionStatus}
        suggestionError={suggestions.suggestionError}
        suggestionMeta={suggestions.suggestionMeta}
        copiedSuggestionId={suggestions.copiedSuggestionId}
        onGenerate={suggestions.handleGenerateSuggestions}
        onCopy={suggestions.handleCopySuggestion}
        onToggleListening={toggleListening}
        onSwitchSession={handleSwitchSession}
        onClose={chatSession.handleClose}
        onToggleViewMode={handleToggleViewMode}
        sessionInfo={chatSession.sessionInfo}
      />
    );
  }


  return (
    <FullHud
      isListening={isListening}
      toggleListening={toggleListening}
      micVolumeLevel={micVolumeLevel}
      systemVolumeLevel={systemVolumeLevel}
      systemAudioNotAuthorized={systemAudioNotAuthorized}
      chatSession={chatSession}
      messages={messages}
      suggestions={suggestions}
      onSwitchSession={handleSwitchSession}
      onToggleViewMode={handleToggleViewMode}
      onClose={chatSession.handleClose}
    />
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