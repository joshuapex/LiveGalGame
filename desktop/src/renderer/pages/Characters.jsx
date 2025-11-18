import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Characters() {
  const [statistics, setStatistics] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [characterDetails, setCharacterDetails] = useState(null);
  const [showAddCharacterModal, setShowAddCharacterModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadStatistics();
    loadCharacters();
  }, []);

  const loadStatistics = async () => {
    try {
      if (window.electronAPI?.getCharacterPageStatistics) {
        const stats = await window.electronAPI.getCharacterPageStatistics();
        setStatistics(stats);
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const loadCharacters = async () => {
    try {
      setLoading(true);
      if (window.electronAPI?.getAllCharacters) {
        const chars = await window.electronAPI.getAllCharacters();
        setCharacters(chars);
      }
    } catch (error) {
      console.error('Failed to load characters:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewCharacterHistory = (characterId) => {
    navigate(`/conversations?character=${characterId}`);
  };

  const viewCharacterDetail = async (characterId) => {
    try {
      setSelectedCharacter(characterId);
      setShowDetailModal(true);
      setCharacterDetails(null);

      if (window.electronAPI?.getCharacterDetails) {
        const details = await window.electronAPI.getCharacterDetails(characterId);
        setCharacterDetails(details);
      }
    } catch (error) {
      console.error('Failed to load character details:', error);
    }
  };

  const closeCharacterDetailModal = () => {
    setShowDetailModal(false);
    setSelectedCharacter(null);
    setCharacterDetails(null);
  };

  const deleteCharacter = async (characterId, characterName) => {
    try {
      // 确认删除
      const confirmed = confirm(
        `确定要删除角色 "${characterName}" 吗？\n\n注意：这将同时删除该角色的所有对话、消息和相关数据！\n\n此操作不可撤销。`
      );

      if (!confirmed) return;

      // 执行删除
      const success = await window.electronAPI.deleteCharacter(characterId);

      if (success) {
        alert(`角色 "${characterName}" 已删除`);
        await loadCharacters();
        await loadStatistics();
      } else {
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('删除角色失败:', error);
      alert('删除失败：' + error.message);
    }
  };

  const getAvatarGradient = (color) => {
    if (color?.includes('ff6b6b')) return 'bg-gradient-to-br from-[#ff6b6b] to-[#ff8e8e]';
    if (color?.includes('4ecdc4')) return 'bg-gradient-to-br from-[#4ecdc4] to-[#6ee5dd]';
    if (color?.includes('ffe66d')) return 'bg-gradient-to-br from-[#ffe66d] to-[#fff099]';
    return 'bg-gradient-to-br from-primary to-[#8e24aa]';
  };

  return (
    <div className="p-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-[#8e24aa] bg-clip-text text-transparent">
            攻略对象
          </h1>
        </div>
        <p className="text-text-muted-light dark:text-text-muted-dark">
          管理与各个角色的关系和档案
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-surface-dark rounded-xl p-6 border border-surface-light dark:border-surface-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-muted-light dark:text-text-muted-dark text-sm">总计攻略对象</span>
            <span className="material-symbols-outlined text-primary">groups</span>
          </div>
          <div className="text-2xl font-bold">
            {statistics?.characterCount ?? '-'}
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark rounded-xl p-6 border border-surface-light dark:border-surface-dark">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <span className="text-text-muted-light dark:text-text-muted-dark text-sm">活跃对话</span>
              <div className="relative group">
                <sup className="text-text-muted-light dark:text-text-muted-dark text-xs cursor-help" style={{ fontSize: '10px', lineHeight: 0 }}>①</sup>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-10">
                  显示两天内（48小时）创建的新对话数量
                  <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                </div>
              </div>
            </div>
            <span className="material-symbols-outlined text-green-500">chat</span>
          </div>
          <div className="text-2xl font-bold">
            {statistics?.activeConversationCount ?? '-'}
          </div>
        </div>

        <div className="bg-white dark:bg-surface-dark rounded-xl p-6 border border-surface-light dark:border-surface-dark">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-muted-light dark:text-text-muted-dark text-sm">平均好感度</span>
            <span className="material-symbols-outlined text-yellow-500">favorite</span>
          </div>
          <div className="text-2xl font-bold">
            {statistics?.avgAffinity ?? '-'}
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowAddCharacterModal(true)}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          添加角色
        </button>
      </div>

      {/* 攻略对象列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-4 text-text-muted-light dark:text-text-muted-dark">加载中...</p>
          </div>
        ) : characters.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-text-muted-light dark:text-text-muted-dark mb-4">还没有角色数据</p>
            <p className="text-sm text-text-muted-light dark:text-text-muted-dark">请在数据库中添加角色数据</p>
          </div>
        ) : (
          characters.map((character) => {
            const firstLetter = character.name.charAt(0);
            const avatarGradient = getAvatarGradient(character.avatar_color);

            return (
              <div
                key={character.id}
                className="bg-white dark:bg-surface-dark rounded-xl p-6 border border-surface-light dark:border-surface-dark hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full ${avatarGradient} flex items-center justify-center text-white text-xl font-bold`}>
                      {firstLetter}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">{character.name}</h3>
                      <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
                        {character.relationship_label}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => deleteCharacter(character.id, character.name)}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="删除角色"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>好感度</span>
                    <span>{character.affinity}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${character.affinity}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted-light dark:text-text-muted-dark">角色ID</span>
                    <span className="font-mono text-xs">{character.id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted-light dark:text-text-muted-dark">创建时间</span>
                    <span>{new Date(character.created_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-text-muted-light dark:text-text-muted-dark mb-2">关键词</p>
                  <div className="flex flex-wrap gap-2">
                    {character.tags?.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-primary/10 text-primary text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => viewCharacterHistory(character.id)}
                    className="flex-1 bg-primary text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    查看历史
                  </button>
                  <button
                    onClick={() => viewCharacterDetail(character.id)}
                    className="px-4 py-2 border border-surface-light dark:border-surface-dark rounded-lg text-sm hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                  >
                    详情
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 角色详情弹窗 */}
      {showDetailModal && (
        <CharacterDetailModal
          characterId={selectedCharacter}
          details={characterDetails}
          onClose={closeCharacterDetailModal}
          onSaved={async () => {
            await loadCharacters();
            await loadStatistics();
          }}
        />
      )}

      {/* 添加角色弹窗 */}
      {showAddCharacterModal && (
        <AddCharacterModal
          onClose={() => setShowAddCharacterModal(false)}
          onSaved={async () => {
            await loadCharacters();
            await loadStatistics();
          }}
        />
      )}
    </div>
  );
}

// 添加角色弹窗组件
function AddCharacterModal({ onClose, onSaved }) {
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

// 角色详情弹窗组件
function CharacterDetailModal({ characterId, details, onClose, onSaved }) {
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

export default Characters;

