import { useState, useCallback } from 'react';

/**
 * 聊天会话管理的自定义Hook
 */
export const useChatSession = () => {
  const [sessionInfo, setSessionInfo] = useState(null);
  const [error, setError] = useState('');

  /**
   * 处理会话选择
   * @param {Object} info - 会话信息
   */
  const handleSessionSelected = useCallback(async (info) => {
    setSessionInfo(info);

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
  }, []);

  /**
   * 关闭HUD
   */
  const handleClose = useCallback(() => {
    if (window.electronAPI?.closeHUD) {
      window.electronAPI.closeHUD();
    }
  }, []);

  /**
   * 切换会话
   */
  const handleSwitchSession = useCallback(() => {
    setSessionInfo(null);
    setError('');
  }, []);

  return {
    // 状态
    sessionInfo,
    error,

    // 方法
    handleSessionSelected,
    handleClose,
    handleSwitchSession,
    setError
  };
};