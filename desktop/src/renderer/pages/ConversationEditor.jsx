import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReviewSection from '../components/review/ReviewSection.jsx';

function ConversationEditor() {
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Resize logic
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const isResizingRef = useRef(false);

  const startResizing = useCallback(() => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizingRef.current) return;
    const newWidth = e.clientX;
    if (newWidth > 150 && newWidth < 600) {
      setSidebarWidth(newWidth);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      selectConversation(conversationId);
    }
  }, [searchParams]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.getAllConversations) {
        const convs = await window.electronAPI.getAllConversations();
        setConversations(convs);
        if (!selectedConversation && convs.length > 0) {
          selectConversation(convs[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectConversation = async (conversationId) => {
    try {
      setSelectedConversation(conversationId);
      if (window.electronAPI?.getMessagesByConversation) {
        const msgs = await window.electronAPI.getMessagesByConversation(conversationId);
        setMessages(msgs);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter(
      (conv) =>
        (conv.title || '').toLowerCase().includes(term) ||
        (conv.character_name || '').toLowerCase().includes(term)
    );
  }, [conversations, searchTerm]);

  useEffect(() => {
    if (filteredConversations.length > 0 && !selectedConversation) {
      selectConversation(filteredConversations[0].id);
    }
  }, [filteredConversations]);

  const selectedConversationData = conversations.find((conv) => conv.id === selectedConversation);
  const characterName = selectedConversationData?.character_name || '未知角色';
  const conversationColor = selectedConversationData?.character_avatar_color || '#ff6b6b';
  const conversationDate = selectedConversationData?.created_at
    ? new Date(selectedConversationData.created_at).toLocaleString('zh-CN')
    : '';
  const deleteConversation = async (conversationId) => {
    try {
      // 确认删除
      const confirmed = confirm(
        `确定要删除这个对话吗？\n\n注意：这将同时删除该对话的所有消息、AI分析和建议！\n\n此操作不可撤销。`
      );

      if (!confirmed) return;

      // 执行删除
      const success = await window.electronAPI.deleteConversation(conversationId);

      if (success) {
        alert('对话已删除');
        await loadConversations();
      } else {
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('删除对话失败:', error);
      alert('删除失败：' + error.message);
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark">
      <aside
        className="flex-shrink-0 border-r border-surface-light dark:border-surface-dark/40 relative group"
        style={{ width: sidebarWidth }}
      >
        <div className="flex h-full flex-col justify-between p-4 overflow-hidden">
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center gap-3 px-2">
              <div
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10"
                style={{ backgroundColor: '#c51662' }}
              />
              <div className="flex flex-col">
                <h1 className="text-text-light dark:text-text-dark text-base font-bold leading-normal">
                  LiveGalGame
                </h1>
                <p className="text-text-muted-light dark:text-text-muted-dark text-sm font-normal leading-normal">
                  历史对话
                </p>
              </div>
            </div>

            <div className="relative px-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 px-4 pl-10 text-sm rounded-full border-none bg-surface-light dark:bg-surface-dark focus:ring-2 focus:ring-primary/50 text-text-light dark:text-text-dark placeholder:text-text-muted-light dark:placeholder:text-text-muted-dark"
                placeholder="搜索对话..."
                type="text"
              />
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-text-muted-light dark:text-text-muted-dark text-lg">
                search
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto mt-2 space-y-1 pr-1">
              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <p className="mt-2 text-sm text-text-muted-light dark:text-text-muted-dark">加载中...</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-text-muted-light dark:text-text-muted-dark">暂无对话</p>
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedConversation === conv.id
                      ? 'bg-surface-light dark:bg-surface-dark'
                      : 'hover:bg-surface-light dark:hover:bg-surface-dark'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex h-3 w-3 rounded-full"
                          style={{ backgroundColor: conv.character_avatar_color || '#c51662' }}
                        />
                        <p className="text-xs text-text-muted-light dark:text-text-muted-dark">
                          与 {conv.character_name || '未知对象'} 的对话
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        title="删除对话"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                    <h3 className="text-sm font-semibold text-text-light dark:text-text-dark mb-1">
                      {conv.title || '无标题对话'}
                    </h3>
                    <p className="text-xs text-text-muted-light dark:text-text-muted-dark line-clamp-2">
                      {conv.summary || '暂无摘要'}
                    </p>
                    <div className="text-[11px] text-text-muted-light dark:text-text-muted-dark mt-1">
                      {conv.created_at ? new Date(conv.created_at).toLocaleString('zh-CN') : '未知时间'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        {/* Resizer Handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
          onMouseDown={startResizing}
        />
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 px-8 pt-8">
          <div>
            <h2 className="text-2xl font-bold text-text-light dark:text-text-dark">
              与 {characterName} 的对话
            </h2>
            {conversationDate && (
              <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
                创建于 {conversationDate}
              </p>
            )}
          </div>
          {selectedConversation && (
            <button
              onClick={() => deleteConversation(selectedConversation)}
              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
              title="删除对话"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
              删除对话
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 px-8 pb-8">
          {/* 复盘区域 - 未复盘时只显示按钮，复盘后显示完整报告 */}
          <ReviewSection
            conversationId={selectedConversation}
            onReviewGenerated={loadConversations}
          />

          {selectedConversation ? (
            <div className="mt-6 max-w-5xl mx-auto">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.sender !== 'user' && (
                      <div
                        className="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-10 shrink-0"
                        style={{ backgroundColor: conversationColor }}
                      />
                    )}
                    <div
                      className={`rounded-2xl px-4 py-3 max-w-[80%] ${msg.sender === 'user'
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-muted-dark rounded-bl-md'
                        }`}
                      style={{
                        borderColor: msg.sender === 'user' ? 'transparent' : conversationColor,
                        borderWidth: msg.sender === 'user' ? 0 : 1,
                        borderStyle: 'solid',
                      }}
                    >
                      <div className="flex items-center justify-between text-[11px] text-text-muted-light dark:text-text-muted-dark mb-1">
                        <span>{msg.sender === 'user' ? '我' : characterName}</span>
                        <span>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString('zh-CN') : ''}</span>
                      </div>
                      <p className="text-base font-normal">{msg.content || msg.text || ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto text-center py-20">
              <span className="material-symbols-outlined text-6xl text-text-muted-light dark:text-text-muted-dark mb-4">
                chat_bubble
              </span>
              <h2 className="text-2xl font-bold mb-2">选择一个对话开始查看</h2>
              <p className="text-text-muted-light dark:text-text-muted-dark">
                从左侧列表中选择一个对话，或创建新对话
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default ConversationEditor;
