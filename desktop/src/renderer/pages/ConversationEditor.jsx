import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

function ConversationEditor() {
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [insightPanelVisible, setInsightPanelVisible] = useState(true);

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
      await loadAiData(conversationId);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadAiData = async (conversationId) => {
    if (!conversationId) {
      setAiData(null);
      return;
    }
    setAiLoading(true);
    try {
      if (window.electronAPI?.getConversationAIData) {
        const data = await window.electronAPI.getConversationAIData(conversationId);
        setAiData(data);
      }
    } catch (error) {
      console.error('Failed to load AI data:', error);
      setAiData(null);
    } finally {
      setAiLoading(false);
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
  const conversationTags = (selectedConversationData?.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

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

  const toggleInsightPanel = () => setInsightPanelVisible((prev) => !prev);

  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark">
      <aside className="w-56 flex-shrink-0 border-r border-surface-light dark:border-surface-dark/40">
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
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedConversation === conv.id
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
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden p-8">
        <div className="flex items-center justify-between mb-4">
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

        <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
          <AIAnalysisPanel aiData={aiData} loading={aiLoading} />
          <KeyMomentsSection moments={aiData?.keyMoments} />
          <AttitudeAnalysisSection attitude={aiData?.attitudeAnalysis} />
          <ActionSuggestionsSection suggestions={aiData?.actionSuggestions} />

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
                      className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                        msg.sender === 'user'
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

      <aside
        className={`flex flex-shrink-0 flex-col border-l border-surface-light dark:border-surface-dark/40 bg-background-light dark:bg-background-dark transition-[width] duration-200 ${
          insightPanelVisible ? 'w-48' : 'w-14'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          {insightPanelVisible ? (
            <h2 className="text-lg font-bold text-text-light dark:text-text-dark">对话总览</h2>
          ) : (
            <span className="text-xs tracking-widest text-text-muted-light dark:text-text-muted-dark">概览</span>
          )}
          <button
            type="button"
            onClick={toggleInsightPanel}
            className="rounded-full p-1 text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={insightPanelVisible ? '收起对话总览' : '展开对话总览'}
          >
            <span className="material-symbols-outlined text-xl">
              {insightPanelVisible ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>
        {insightPanelVisible && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <ConversationInsights aiData={aiData} tags={conversationTags} />
          </div>
        )}
        {!insightPanelVisible && (
          <div className="flex flex-1 items-center justify-center px-2">
            <button
              type="button"
              onClick={toggleInsightPanel}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
            >
              展开
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

export default ConversationEditor;

function AIAnalysisPanel({ aiData, loading }) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-2xl border border-border-light bg-surface-light p-4 shadow-sm dark:border-border-dark dark:bg-surface-dark">
        <div className="h-3 w-1/3 animate-pulse rounded-full bg-text-muted-light dark:bg-text-muted-dark" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-text-muted-light dark:bg-text-muted-dark" />
      </div>
    );
  }

  const report = aiData?.analysisReport;
  if (!report) {
    return (
      <div className="rounded-2xl border border-border-light bg-surface-light p-4 text-sm text-text-muted-light dark:border-border-dark dark:bg-surface-dark">
        AI 分析报告数据暂未生成
      </div>
    );
  }

  const sections = [
    { label: '表述能力', data: report.expressionAbility },
    { label: '话题选择', data: report.topicSelection }
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-border-light bg-surface-light p-4 shadow-sm dark:border-border-dark dark:bg-surface-dark">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-light dark:text-text-dark">AI分析报告</h3>
        <span className="text-xs text-text-muted-light dark:text-text-muted-dark">洞察更新于最新对话</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div
            key={section.label}
            className="rounded-2xl border border-border-light bg-white p-4 text-sm dark:border-border-dark dark:bg-surface-dark"
          >
            <div className="flex items-center justify-between text-xs uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark">
              <span>{section.label}</span>
              <span>{section.data?.score ?? '--'} 分</span>
            </div>
            <p className="mt-2 text-base text-text-light dark:text-text-dark">
              {section.data?.description || '暂无描述'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyMomentsSection({ moments }) {
  if (!moments || moments.length === 0) {
    return null;
  }

  const renderEvaluation = (evaluation) => {
    if (!evaluation) return '';
    if (typeof evaluation === 'string') return evaluation;
    return evaluation.content || evaluation.description || '';
  };

  return (
    <div className="rounded-2xl border border-border-light bg-surface-light p-4 shadow-sm dark:border-border-dark dark:bg-surface-dark">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-light dark:text-text-dark mb-3">
        <span className="material-symbols-outlined text-primary">schedule</span>
        关键时刻回放
      </div>
      <div className="space-y-3">
        {moments.map((moment) => (
          <div
            key={moment.id}
            className="rounded-2xl border border-border-light/40 bg-white p-3 text-sm dark:border-border-dark/60 dark:bg-surface-dark"
          >
            <div className="flex items-center justify-between text-[11px] text-text-muted-light dark:text-text-muted-dark mb-2">
              <span>{moment.sender === 'user' ? '我' : '对方'}</span>
              <span>{moment.timestamp ? new Date(moment.timestamp).toLocaleTimeString('zh-CN') : ''}</span>
            </div>
            <p className="text-text-light dark:text-text-dark">{moment.messageContent || '（无内容）'}</p>
            <p className="mt-2 text-xs text-text-muted-light dark:text-text-muted-dark">
              {renderEvaluation(moment.evaluation) || 'AI暂无评估'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttitudeAnalysisSection({ attitude }) {
  if (!attitude) return null;

  const affinityText = attitude.affinityChange >= 0 ? `+${attitude.affinityChange}` : attitude.affinityChange;

  return (
    <div className="rounded-2xl border border-border-light bg-surface-light p-4 shadow-sm dark:border-border-dark dark:bg-surface-dark">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-light dark:text-text-dark">
          <span className="material-symbols-outlined text-primary">psychology</span>
          本轮对话表现态度分析
        </div>
        <span className="text-xs text-text-muted-light dark:text-text-muted-dark">
          趋势：{attitude.trend}
        </span>
      </div>
      <p className="text-sm text-text-muted-light dark:text-text-muted-dark mb-2">{attitude.description}</p>
      <div className="text-sm font-semibold text-text-light dark:text-text-dark">
        好感度变化：{affinityText} 点
      </div>
    </div>
  );
}

function ActionSuggestionsSection({ suggestions }) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border-light bg-surface-light p-4 shadow-sm dark:border-border-dark dark:bg-surface-dark">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-light dark:text-text-dark mb-3">
        <span className="material-symbols-outlined text-primary">lightbulb</span>
        行动建议
      </div>
      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="rounded-2xl border border-border-light/60 bg-white p-3 text-sm dark:border-border-dark/60 dark:bg-surface-dark"
          >
            <div className="flex items-center justify-between text-xs text-text-muted-light dark:text-text-muted-dark mb-1">
              <span>{suggestion.title}</span>
              {suggestion.affinity_prediction !== null && (
                <span>
                  预估好感度：
                  {suggestion.affinity_prediction > 0
                    ? `+${suggestion.affinity_prediction}`
                    : suggestion.affinity_prediction}
                </span>
              )}
            </div>
            <p className="text-text-light dark:text-text-dark">{suggestion.content}</p>
            {suggestion.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                {suggestion.tags.map((tag) => (
                  <span key={`${suggestion.id}-${tag}`} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversationInsights({ aiData, tags }) {
  const report = aiData?.analysisReport;
  const suggestionTags = aiData?.actionSuggestions?.flatMap((item) => item.tags || []) || [];
  const uniqueSuggestionTags = Array.from(new Set(suggestionTags));
  const insights = [
    report?.expressionAbility?.description,
    report?.topicSelection?.description,
    aiData?.attitudeAnalysis?.description
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {insights.length > 0 ? (
        <div className="rounded-2xl border border-border-light bg-white p-4 text-sm shadow-sm dark:border-border-dark dark:bg-surface-dark">
          <h3 className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark mb-3">复盘分析</h3>
          <div className="space-y-2">
            {insights.map((insight, idx) => (
              <p key={idx} className="text-text-muted-light dark:text-text-muted-dark">
                {insight}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border-light bg-white p-4 text-sm text-text-muted-light shadow-sm dark:border-border-dark dark:bg-surface-dark">
          AI 分析数据暂未生成
        </div>
      )}

      {tags.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark">对话分类</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {uniqueSuggestionTags.length > 0 && (
        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark">AI 建议分类</p>
          <div className="flex flex-wrap gap-2">
            {uniqueSuggestionTags.map((tag) => (
              <button
                key={tag}
                className="flex items-center gap-1.5 rounded-full bg-surface-light px-2.5 py-1 text-xs font-medium text-text-light dark:bg-surface-dark dark:text-text-muted-dark hover:bg-primary-subtle-light/50"
                type="button"
              >
                <span className="material-symbols-outlined text-xs">add</span>
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

