import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddCharacterModal, CharacterDetailModal } from './CharacterModals';

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

export default Characters;

