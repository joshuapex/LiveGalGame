import { useState, useCallback, useRef, useEffect } from 'react';

const DEFAULT_SUGGESTION_CONFIG = {
  enable_passive_suggestion: 1,
  suggestion_count: 3,
  silence_threshold_seconds: 3,
  message_threshold_count: 3,
  cooldown_seconds: 30,
  context_message_limit: 10,
  topic_detection_enabled: 0
};

const PASSIVE_REASON_LABEL = {
  silence: '静默提醒',
  message_count: '多条消息',
  topic_change: '话题转折',
  manual: '手动触发'
};

const TOPIC_HEURISTIC_REGEX = /[?？]|(吗|呢|怎么|可以|愿不愿意|要不要|想不想|麻烦|拜托|一起|安排|帮|请)/;

/**
 * 建议生成和管理的自定义Hook
 */
export const useSuggestions = (sessionInfo) => {
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionMeta, setSuggestionMeta] = useState(null);
  const [suggestionStatus, setSuggestionStatus] = useState('idle');
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionConfig, setSuggestionConfig] = useState(DEFAULT_SUGGESTION_CONFIG);
  const [characterPendingCount, setCharacterPendingCount] = useState(0);
  const [lastCharacterMessageTs, setLastCharacterMessageTs] = useState(null);
  const [copiedSuggestionId, setCopiedSuggestionId] = useState(null);
  const suggestionCooldownRef = useRef(0);
  const topicDetectionStateRef = useRef({ running: false, lastMessageId: null });
  const activeStreamRef = useRef({ id: null, trigger: null, reason: null });

  /**
   * 加载建议配置
   */
  const loadSuggestionConfig = useCallback(async () => {
    try {
      const api = window.electronAPI;
      if (!api?.getSuggestionConfig) return;
      const config = await api.getSuggestionConfig();
      if (config) {
        setSuggestionConfig({
          ...DEFAULT_SUGGESTION_CONFIG,
          ...config
        });
      }
    } catch (err) {
      console.error('加载建议配置失败：', err);
    }
  }, []);

  /**
   * 检查是否可以触发被动建议
   */
  const canTriggerPassive = useCallback(() => {
    if (!suggestionConfig?.enable_passive_suggestion) return false;
    const cooldownMs = (suggestionConfig?.cooldown_seconds || 30) * 1000;
    const elapsed = Date.now() - (suggestionCooldownRef.current || 0);
    return elapsed >= cooldownMs;
  }, [suggestionConfig]);

  const resetStreamState = useCallback(() => {
    activeStreamRef.current = { id: null, trigger: null, reason: null };
  }, []);

  const logStreamCharacters = useCallback((label, text) => {
    if (!text) return;
    for (let index = 0; index < text.length; index += 1) {
      console.log(`[useSuggestions] ${label} char #${index}: "${text[index]}"`);
    }
  }, []);

  const startSuggestionStream = useCallback(
    ({ trigger, reason }) => {
      console.log('[useSuggestions] startSuggestionStream called with:', { trigger, reason });
      if (!window.electronAPI?.startSuggestionStream) {
        console.warn('[useSuggestions] startSuggestionStream API not available');
        return false;
      }
      const streamId = `suggestion-stream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      console.log(`[useSuggestions] Generated streamId: ${streamId}`);
      activeStreamRef.current = { id: streamId, trigger, reason };

      console.log('[useSuggestions] Resetting state for new stream');
      setSuggestions([]);
      setSuggestionMeta(null);
      setSuggestionError('');
      setSuggestionStatus('streaming');

      const payload = {
        streamId,
        conversationId: sessionInfo.conversationId,
        characterId: sessionInfo.characterId,
        trigger,
        reason,
        optionCount: suggestionConfig?.suggestion_count,
        messageLimit: suggestionConfig?.context_message_limit
      };
      console.log('[useSuggestions] Sending startSuggestionStream payload:', payload);

      window.electronAPI.startSuggestionStream(payload);
      console.log('[useSuggestions] startSuggestionStream API called successfully');
      return true;
    },
    [sessionInfo, suggestionConfig]
  );

  /**
   * 生成建议
   */
  const handleGenerateSuggestions = useCallback(
    async ({ trigger = 'manual', reason = 'manual' } = {}) => {
      if (!sessionInfo?.conversationId || !sessionInfo?.characterId) {
        setSuggestionError('请先选择有效的会话');
        return;
      }

      if (suggestionStatus === 'loading' || suggestionStatus === 'streaming') {
        return;
      }

      if (window.electronAPI?.startSuggestionStream) {
        startSuggestionStream({ trigger, reason });
        return;
      }

      if (!window.electronAPI?.generateLLMSuggestions) {
        setSuggestionError('LLM接口不可用');
        return;
      }

      setSuggestionStatus('loading');
      setSuggestionError('');
      try {
        const result = await window.electronAPI.generateLLMSuggestions({
          conversationId: sessionInfo.conversationId,
          characterId: sessionInfo.characterId,
          trigger,
          reason,
          optionCount: suggestionConfig?.suggestion_count,
          messageLimit: suggestionConfig?.context_message_limit
        });
        setSuggestions(result?.suggestions || []);
        setSuggestionMeta({
          ...(result?.metadata || {}),
          trigger,
          reason,
          triggeredAt: Date.now()
        });
        suggestionCooldownRef.current = Date.now();
      } catch (err) {
        console.error('生成建议失败：', err);
        setSuggestionError(err?.message || '生成失败，请稍后重试');
      } finally {
        setSuggestionStatus('idle');
      }
    },
    [sessionInfo, suggestionConfig, suggestionStatus, startSuggestionStream]
  );

  /**
   * 触发被动建议
   */
  const triggerPassiveSuggestion = useCallback((reason) => {
    if (!canTriggerPassive()) return;
    if (suggestionStatus === 'streaming') return;
    handleGenerateSuggestions({ trigger: 'passive', reason });
  }, [canTriggerPassive, handleGenerateSuggestions, suggestionStatus]);

  /**
   * 复制建议
   */
  const handleCopySuggestion = useCallback(async (id, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSuggestionId(id);
      setTimeout(() => {
        setCopiedSuggestionId((prev) => (prev === id ? null : prev));
      }, 1500);
    } catch (err) {
      console.error('复制建议失败：', err);
    }
  }, []);

  /**
   * 运行话题检测
   */
  const maybeRunTopicDetection = useCallback(async (message) => {
    if (!suggestionConfig?.topic_detection_enabled) return;
    if (!message?.content || !message?.id) return;
    if (!sessionInfo?.conversationId || !sessionInfo?.characterId) return;
    if (!TOPIC_HEURISTIC_REGEX.test(message.content)) return;
    if (!window.electronAPI?.detectTopicShift) return;

    const currentState = topicDetectionStateRef.current;
    if (currentState.running || currentState.lastMessageId === message.id) {
      return;
    }

    topicDetectionStateRef.current = { running: true, lastMessageId: message.id };
    try {
      const result = await window.electronAPI.detectTopicShift({
        conversationId: sessionInfo.conversationId,
        characterId: sessionInfo.characterId,
        messageLimit: 6
      });
      if (result?.shouldSuggest) {
        triggerPassiveSuggestion('topic_change');
      }
    } catch (err) {
      console.error('话题检测失败：', err);
    } finally {
      topicDetectionStateRef.current = {
        ...topicDetectionStateRef.current,
        running: false
      };
    }
  }, [sessionInfo, suggestionConfig?.topic_detection_enabled, triggerPassiveSuggestion]);

  /**
   * 处理新消息
   */
  const handleNewMessage = useCallback((message) => {
    if (message.sender === 'character') {
      setCharacterPendingCount(prev => {
        const next = prev + 1;
        if (
          suggestionConfig?.enable_passive_suggestion &&
          next >= (suggestionConfig?.message_threshold_count || 3)
        ) {
          triggerPassiveSuggestion('message_count');
        }
        return next;
      });
      setLastCharacterMessageTs(Date.now());
      maybeRunTopicDetection(message);
    } else if (message.sender === 'user') {
      setCharacterPendingCount(0);
    }
  }, [suggestionConfig, triggerPassiveSuggestion, maybeRunTopicDetection]);

  /**
   * 清除错误
   */
  const clearSuggestionError = useCallback(() => {
    setSuggestionError('');
  }, []);

  const streamingHandlersRegisteredRef = useRef(false);

  useEffect(() => {
    if (!window.electronAPI?.startSuggestionStream || streamingHandlersRegisteredRef.current) {
      return undefined;
    }
    const unsubs = [];
    streamingHandlersRegisteredRef.current = true;

    if (window.electronAPI.onSuggestionStreamStart) {
      unsubs.push(
        window.electronAPI.onSuggestionStreamStart((data = {}) => {
          console.log('[useSuggestions] Received onSuggestionStreamStart:', data);
          if (data.streamId !== activeStreamRef.current?.id) {
            console.log(`[useSuggestions] Ignoring stream start - streamId mismatch: ${data.streamId} vs ${activeStreamRef.current?.id}`);
            return;
          }
          console.log('[useSuggestions] Processing stream start event');
          setSuggestionMeta((prev) => ({
            ...(prev || {}),
            trigger: activeStreamRef.current.trigger,
            reason: activeStreamRef.current.reason,
            expectedCount: data.expectedCount,
            triggeredAt: Date.now(),
            streaming: true
          }));
        })
      );
    }

    if (window.electronAPI.onSuggestionStreamHeader) {
      unsubs.push(
        window.electronAPI.onSuggestionStreamHeader((data = {}) => {
          console.log('[useSuggestions] Received onSuggestionStreamHeader:', data);
          if (data.streamId !== activeStreamRef.current?.id) {
            console.log(`[useSuggestions] Ignoring header - streamId mismatch: ${data.streamId} vs ${activeStreamRef.current?.id}`);
            return;
          }
          console.log('[useSuggestions] Processing stream header event');
          setSuggestionMeta((prev) => ({
            ...(prev || {}),
            expectedCount: data.expectedCount
          }));
        })
      );
    }

    if (window.electronAPI.onSuggestionStreamChunk) {
      unsubs.push(
        window.electronAPI.onSuggestionStreamChunk((data = {}) => {
          console.log('[useSuggestions] Received onSuggestionStreamChunk:', data);
          if (data.streamId !== activeStreamRef.current?.id) {
            console.log(`[useSuggestions] Ignoring chunk - streamId mismatch: ${data.streamId} vs ${activeStreamRef.current?.id}`);
            return;
          }
          const chunkText =
            data?.chunk ||
            data?.delta ||
            data?.text ||
            data?.suggestion?.content ||
            '';
          logStreamCharacters('stream chunk', chunkText);
          if (!data.suggestion) {
            console.warn('[useSuggestions] Received chunk without suggestion data');
            return;
          }
          console.log('[useSuggestions] Processing suggestion chunk:', data.suggestion);
          setSuggestions((prev) => {
            const newSuggestions = [...prev, data.suggestion];
            console.log(`[useSuggestions] Updated suggestions count: ${newSuggestions.length}`);
            return newSuggestions;
          });
        })
      );
    }

    if (window.electronAPI.onSuggestionStreamError) {
      unsubs.push(
        window.electronAPI.onSuggestionStreamError((data = {}) => {
          console.error('[useSuggestions] Received onSuggestionStreamError:', data);
          if (data.streamId && data.streamId !== activeStreamRef.current?.id) {
            console.log(`[useSuggestions] Ignoring error - streamId mismatch: ${data.streamId} vs ${activeStreamRef.current?.id}`);
            return;
          }
          console.log('[useSuggestions] Processing stream error event');
          setSuggestionError(data.error || '生成失败，请稍后重试');
          setSuggestionStatus('idle');
          resetStreamState();
        })
      );
    }

    if (window.electronAPI.onSuggestionStreamEnd) {
      unsubs.push(
        window.electronAPI.onSuggestionStreamEnd((data = {}) => {
          console.log('[useSuggestions] Received onSuggestionStreamEnd:', data);
          if (data.streamId !== activeStreamRef.current?.id) {
            console.log(`[useSuggestions] Ignoring stream end - streamId mismatch: ${data.streamId} vs ${activeStreamRef.current?.id}`);
            return;
          }
          console.log('[useSuggestions] Processing stream end event');
          if (data.success) {
            console.log('[useSuggestions] Stream completed successfully');
          } else {
            console.warn('[useSuggestions] Stream ended without success');
          }
          setSuggestionStatus('idle');
          if (data.metadata) {
            setSuggestionMeta({
              ...data.metadata,
              triggeredAt: Date.now()
            });
          }
          suggestionCooldownRef.current = Date.now();
          resetStreamState();
        })
      );
    }

    return () => {
      unsubs.forEach((off) => off && off());
      streamingHandlersRegisteredRef.current = false;
    };
  }, [resetStreamState]);

  // 当session变化时，重置状态
  useEffect(() => {
    if (!sessionInfo?.conversationId) {
      setSuggestions([]);
      setSuggestionMeta(null);
      setCharacterPendingCount(0);
      setLastCharacterMessageTs(null);
      suggestionCooldownRef.current = 0;
      topicDetectionStateRef.current = { running: false, lastMessageId: null };
      resetStreamState();
      return;
    }

    loadSuggestionConfig();
    setSuggestions([]);
    setSuggestionMeta(null);
    setCharacterPendingCount(0);
    setLastCharacterMessageTs(null);
    suggestionCooldownRef.current = 0;
    topicDetectionStateRef.current = { running: false, lastMessageId: null };
    resetStreamState();
  }, [sessionInfo?.conversationId, loadSuggestionConfig, resetStreamState]);

  // 静默触发检查
  useEffect(() => {
    if (!suggestionConfig?.enable_passive_suggestion) return undefined;
    if (!characterPendingCount || !lastCharacterMessageTs) return undefined;
    const thresholdMs = (suggestionConfig?.silence_threshold_seconds || 3) * 1000;
    const elapsed = Date.now() - lastCharacterMessageTs;
    const wait = Math.max(thresholdMs - elapsed, 0);
    const timer = setTimeout(() => {
      triggerPassiveSuggestion('silence');
    }, wait);
    return () => clearTimeout(timer);
  }, [characterPendingCount, lastCharacterMessageTs, suggestionConfig, triggerPassiveSuggestion]);

  return {
    // 状态
    suggestions,
    suggestionMeta,
    suggestionStatus,
    suggestionError,
    suggestionConfig,
    characterPendingCount,
    lastCharacterMessageTs,
    copiedSuggestionId,

    // 常量
    PASSIVE_REASON_LABEL,

    // 方法
    handleGenerateSuggestions,
    triggerPassiveSuggestion,
    handleCopySuggestion,
    handleNewMessage,
    clearSuggestionError,
    loadSuggestionConfig
  };
};