import { useEffect, useState } from 'react';

export function AddCharacterModal({ onClose, onSaved }) {
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    relationship_label: '',
    avatar_color: '#ff6b6b',
    affinity: 50,
    notes: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('请输入角色名称');
      return;
    }

    setLoading(true);
    try {
      const success = await window.electronAPI.createCharacter(formData);

      if (success) {
        alert('角色添加成功！');
        onSaved();
        onClose();
      } else {
        alert('添加失败，请重试');
      }
    } catch (error) {
      console.error('添加角色失败:', error);
      alert('添加失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} title="添加新角色">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            角色名称 *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-surface-light dark:border-surface-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="例如：小樱"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            昵称
          </label>
          <input
            type="text"
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            className="w-full px-3 py-2 border border-surface-light dark:border-surface-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="例如：樱"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            关系标签
          </label>
          <input
            type="text"
            value={formData.relationship_label}
            onChange={(e) => setFormData({ ...formData, relationship_label: e.target.value })}
            className="w-full px-3 py-2 border border-surface-light dark:border-surface-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="例如：青梅竹马、学生会长"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            初始好感度
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              value={formData.affinity}
              onChange={(e) => setFormData({ ...formData, affinity: parseInt(e.target.value) })}
              className="flex-1"
            />
            <span className="text-sm font-medium">{formData.affinity}%</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-light dark:text-text-dark mb-2">
            备注
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-3 py-2 border border-surface-light dark:border-surface-dark rounded-lg bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            rows="3"
            placeholder="可选：添加一些关于这个角色的备注..."
          />
        </div>

        <div className="flex gap-3 pt-4 border-t border-surface-light dark:border-surface-dark">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '添加中...' : '添加角色'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-surface-light dark:border-surface-dark rounded-lg hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

export function CharacterDetailModal({ characterId, details, onClose, onSaved }) {
  const [formData, setFormData] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (details) {
      setFormData(JSON.parse(JSON.stringify(details)));
    }
    setEditMode(false);
  }, [details]);

  if (!details) {
    return (
      <ModalWrapper onClose={onClose} title="加载中">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-4 text-text-muted-light dark:text-text-muted-dark">加载中...</p>
        </div>
      </ModalWrapper>
    );
  }

  const toggleEditMode = () => {
    if (!editMode) {
      setFormData(JSON.parse(JSON.stringify(details)));
    }
    setEditMode(!editMode);
  };

  const updateTopLevelField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateProfileField = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      profile: {
        ...(prev?.profile || {}),
        [field]: value,
      },
    }));
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    setFormData((prev) => {
      const tags = prev?.profile?.tags ? [...prev.profile.tags] : [];
      if (tags.includes(newTag.trim())) return prev;
      return {
        ...prev,
        profile: {
          ...(prev?.profile || {}),
          tags: [...tags, newTag.trim()],
        },
      };
    });
    setNewTag('');
  };

  const removeTag = (tag) => {
    setFormData((prev) => {
      const tags = (prev?.profile?.tags || []).filter((t) => t !== tag);
      return {
        ...prev,
        profile: {
          ...(prev?.profile || {}),
          tags,
        },
      };
    });
  };

  const saveEditedDetails = async () => {
    if (!characterId || !formData) return;
    try {
      const success = await window.electronAPI.saveCharacterDetails(characterId, formData);
      if (success) {
        alert('保存成功！');
        setEditMode(false);
        if (onSaved) onSaved();
      } else {
        alert('保存失败，请重试');
      }
    } catch (error) {
      console.error('Failed to save edited details:', error);
      alert('保存失败：' + error.message);
    }
  };

  const personalityTags = details.personality_traits?.keywords || [];
  const likes = details.likes_dislikes?.likes || [];
  const dislikes = details.likes_dislikes?.dislikes || [];
  const events = details.important_events || [];

  return (
    <ModalWrapper onClose={onClose} title={`查看 ${details.profile?.name ?? ''} 的详细信息`}>
      <div className="space-y-6">
        <Section title="角色档案" icon="person">
          <ProfileSection editMode={editMode} data={formData?.profile} onChange={updateProfileField} />
          <TagsSection tags={formData?.profile?.tags || []} editMode={editMode} newTag={newTag} setNewTag={setNewTag} addTag={addTag} removeTag={removeTag} />
        </Section>

        <Section title="性格特点" icon="psychology">
          <div className="flex flex-wrap gap-2 mb-3">
            {personalityTags.map((tag) => (
              <span key={tag} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                {tag}
              </span>
            ))}
          </div>
          <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
            {details.personality_traits?.descriptions?.join('；') || '暂无性格描述'}
          </p>
        </Section>

        <Section title="喜好厌恶" icon="favorite">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ListBlock label="喜欢" items={likes} emptyLabel="暂无数据" />
            <ListBlock label="不喜欢" items={dislikes} emptyLabel="暂无数据" />
          </div>
        </Section>

        <Section title="重要事件" icon="event">
          {events.length === 0 && <p className="text-sm text-text-muted-light dark:text-text-muted-dark">暂无数据</p>}
          <div className="space-y-4">
            {events.map((event, idx) => (
              <div key={idx} className="border-l-2 border-primary pl-3 pb-3">
                <div className="flex items-start justify-between mb-1">
                  <div className="font-medium text-text-light dark:text-text-dark">{event.title}</div>
                  <div className="text-xs text-text-muted-light dark:text-text-muted-dark">
                    {event.date ? new Date(event.date).toLocaleDateString('zh-CN') : ''}
                  </div>
                </div>
                {event.summary && <p className="text-sm text-text-muted-light dark:text-text-muted-dark mb-1">{event.summary}</p>}
                {event.affinity_change !== undefined && (
                  <div className="text-xs text-green-600 dark:text-green-400">
                    好感度{event.affinity_change > 0 ? '+' : ''}
                    {event.affinity_change}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section title="对话总结" icon="chat_bubble">
          {editMode ? (
            <textarea
              value={formData?.conversation_summary || ''}
              onChange={(e) => updateTopLevelField('conversation_summary', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-surface-light dark:border-surface-dark rounded bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
              rows={4}
            />
          ) : (
            <p className="text-sm text-text-muted-light dark:text-text-muted-dark leading-relaxed">
              {details.conversation_summary || '暂无对话总结'}
            </p>
          )}
        </Section>
      </div>

      <div className="mt-6 flex justify-between gap-3 pt-4 border-t border-surface-light dark:border-surface-dark">
        <button
          onClick={toggleEditMode}
          className="px-3 py-2 text-sm rounded-lg border border-surface-light dark:border-surface-dark text-text-muted-light dark:text-text-muted-dark hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
        >
          {editMode ? '取消编辑' : '编辑模式'}
        </button>
        {editMode && (
          <button
            onClick={saveEditedDetails}
            className="px-6 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
          >
            保存更改
          </button>
        )}
      </div>
    </ModalWrapper>
  );
}

function ModalWrapper({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-dark dark:bg-surface-light rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Header title={title} onClose={onClose} />
        {children}
      </div>
    </div>
  );
}

function Header({ title, onClose }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-2xl">account_circle</span>
      </div>
      <div className="flex-1">
        <h2 className="text-xl font-bold text-text-light dark:text-text-dark">{title}</h2>
        <p className="text-sm text-text-muted-light dark:text-text-muted-dark">角色档案与对话总结</p>
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-full hover:bg-surface-light dark:hover:bg-surface-dark text-text-muted-light dark:text-text-muted-dark hover:text-text-light dark:hover:text-text-dark transition-colors"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-surface-light dark:bg-surface-dark rounded-lg p-4">
      <h3 className="text-lg font-semibold text-text-light dark:text-text-dark mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ProfileSection({ editMode, data, onChange }) {
  const value = data || {};
  return (
    <div className="space-y-3 text-sm">
      {['name', 'nickname', 'relationship_label'].map((field) => (
        <div key={field} className="flex items-center gap-2">
          <span className="text-text-muted-light dark:text-text-muted-dark w-20">
            {field === 'name' ? '姓名：' : field === 'nickname' ? '昵称：' : '关系：'}
          </span>
          {editMode ? (
            <input
              value={value[field] || ''}
              onChange={(e) => onChange(field, e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-surface-light dark:border-surface-dark rounded bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          ) : (
            <span className="text-text-light dark:text-text-dark font-medium flex-1">
              {value[field] || ''}
            </span>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="text-text-muted-light dark:text-text-muted-dark w-20">好感度：</span>
        {editMode ? (
          <input
            type="number"
            min={0}
            max={100}
            value={value.affinity ?? ''}
            onChange={(e) => onChange('affinity', Number(e.target.value))}
            className="w-24 px-2 py-1 text-sm border border-surface-light dark:border-surface-dark rounded bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        ) : (
          <span className="text-text-light dark:text-text-dark font-medium">
            {value.affinity !== undefined ? `${value.affinity}%` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function TagsSection({ tags, editMode, newTag, setNewTag, addTag, removeTag }) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 bg-primary/10 text-primary text-xs rounded inline-flex items-center gap-2"
          >
            {tag}
            {editMode && (
              <button type="button" onClick={() => removeTag(tag)} className="text-sm hover:text-red-500">
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {editMode && (
        <div className="mt-2 flex gap-2">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm border border-surface-light dark:border-surface-dark rounded bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="添加标签（回车或点击添加）"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <button
            type="button"
            onClick={addTag}
            className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
          >
            添加
          </button>
        </div>
      )}
    </div>
  );
}

function ListBlock({ label, items, emptyLabel }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-text-light dark:text-text-dark">{label}</span>
        <span className="text-xs text-text-muted-light dark:text-text-muted-dark">•</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted-light dark:text-text-muted-dark">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <p key={`${item}-${idx}`} className="text-sm text-text-muted-light dark:text-text-muted-dark">
              • {item}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}


