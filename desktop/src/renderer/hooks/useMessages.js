import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * 消息管理的自定义Hook
 */
export const useMessages = (conversationId) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const transcriptRef = useRef(null);

  /**
   * 加载消息
   */
  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setLoading(false);
      return;
    }

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
  }, [conversationId]);

  /**
   * 添加消息
   */
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  /**
   * 更新消息
   */
  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  }, []);

  /**
   * 滚动到底部
   */
  const scrollToBottom = useCallback(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, []);

  // 当conversationId变化时，重新加载消息
  useEffect(() => {
    if (conversationId) {
      loadMessages();
    } else {
      setMessages([]);
      setLoading(false);
    }
  }, [conversationId, loadMessages]);

  // 当消息变化时，自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 设置消息监听器
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.on || !conversationId) return;

    // 监听完整句子识别结果（新消息）
    const handleSentenceComplete = (message) => {
      try {
        if (!message) return;

        // 兼容旧格式（result.text）
        if (!message.id && message.text) {
          const normalized = (message.text || '').trim();
          if (!normalized) return;
          const sender = message.sourceId === 'speaker1' ? 'user' : 'character';
          addMessage({
            id: `${Date.now()}`,
            conversation_id: conversationId,
            sender,
            content: normalized,
            timestamp: Date.now()
          });
          return;
        }

        // 默认：ASRManager 已经写入数据库并返回 message 记录
        addMessage(message);
      } catch (error) {
        console.error('Error handling ASR result:', error);
        setError(`处理识别结果失败：${error.message}`);
      }
    };

    // 监听消息更新事件（更新现有消息内容）
    const handleSentenceUpdate = (updatedMessage) => {
      try {
        if (!updatedMessage || !updatedMessage.id) return;
        updateMessage(updatedMessage.id, { content: updatedMessage.content });
      } catch (error) {
        console.error('Error handling ASR update:', error);
      }
    };

    // 监听 ASR 错误
    const handleError = (error) => {
      console.error('ASR error:', error);
      setError(`语音识别错误：${error.error || error.message || '未知错误'}`);
    };

    api.on('asr-sentence-complete', handleSentenceComplete);
    api.on('asr-sentence-update', handleSentenceUpdate);
    api.on('asr-error', handleError);

    return () => {
      api.removeListener('asr-sentence-complete', handleSentenceComplete);
      api.removeListener('asr-sentence-update', handleSentenceUpdate);
      api.removeListener('asr-error', handleError);
    };
  }, [conversationId, addMessage, updateMessage]);

  return {
    // 状态
    messages,
    loading,
    error,
    transcriptRef,

    // 方法
    loadMessages,
    addMessage,
    updateMessage,
    scrollToBottom,
    setError
  };
};