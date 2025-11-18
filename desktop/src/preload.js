const { contextBridge, ipcRenderer } = require('electron');

// Preload 脚本中使用简单的 console 日志
// 注意：在 Electron 的 preload 环境中，某些 Node.js 模块可能不可用
// 因此直接使用 console 而不是加载自定义 logger
const logger = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console)
};

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,

  // IPC通信
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
  once: (channel, callback) => ipcRenderer.once(channel, (event, ...args) => callback(...args)),
  removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),

  // 日志
  log: (message) => ipcRenderer.send('log', message),

  // HUD控制
  showHUD: () => ipcRenderer.send('show-hud'),
  hideHUD: () => ipcRenderer.send('hide-hud'),
  closeHUD: () => ipcRenderer.send('close-hud'),

  // HUD拖拽
  startHUDDrag: (pos) => ipcRenderer.send('start-hud-drag', pos),
  updateHUDDrag: (pos) => ipcRenderer.send('update-hud-drag', pos),
  endHUDDrag: () => ipcRenderer.send('end-hud-drag'),

  // 主窗口控制
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // 窗口拖拽
  startDrag: (pos) => ipcRenderer.send('start-drag', pos),
  updateDrag: (pos) => ipcRenderer.send('update-drag', pos),
  endDrag: () => ipcRenderer.send('end-drag'),

  // 数据库API
  getAllCharacters: () => ipcRenderer.invoke('db-get-all-characters'),
  getCharacterById: (id) => ipcRenderer.invoke('db-get-character-by-id', id),
  createCharacter: (characterData) => ipcRenderer.invoke('db-create-character', characterData),
  dbCreateConversation: (conversationData) => ipcRenderer.invoke('db-create-conversation', conversationData),
  getConversationsByCharacter: (characterId) => ipcRenderer.invoke('db-get-conversations-by-character', characterId),
  dbCreateMessage: (messageData) => ipcRenderer.invoke('db-create-message', messageData),
  getMessagesByConversation: (conversationId) => ipcRenderer.invoke('db-get-messages-by-conversation', conversationId),
  updateConversation: (conversationId, updates) => ipcRenderer.invoke('db-update-conversation', conversationId, updates),
  getStatistics: () => ipcRenderer.invoke('db-get-statistics'),
  getCharacterPageStatistics: () => ipcRenderer.invoke('db-get-character-page-statistics'),
  getRecentConversations: (limit) => ipcRenderer.invoke('db-get-recent-conversations', limit),
  getAllConversations: () => ipcRenderer.invoke('db-get-all-conversations'),
  updateMessage: (messageId, updates) => ipcRenderer.invoke('db-update-message', messageId, updates),
  getConversationAIData: (conversationId) => ipcRenderer.invoke('db-get-conversation-ai-data', conversationId),
  getCharacterDetails: (characterId) => ipcRenderer.invoke('db-get-character-details', characterId),
  updateCharacterDetailsCustomFields: (characterId, customFields) => ipcRenderer.invoke('db-update-character-details-custom-fields', characterId, customFields),
  regenerateCharacterDetails: (characterId) => ipcRenderer.invoke('db-regenerate-character-details', characterId),
  deleteConversation: (conversationId) => ipcRenderer.invoke('db-delete-conversation', conversationId),
  deleteCharacter: (characterId) => ipcRenderer.invoke('db-delete-character', characterId),

  // LLM配置API
  saveLLMConfig: (configData) => ipcRenderer.invoke('llm-save-config', configData),
  getAllLLMConfigs: () => ipcRenderer.invoke('llm-get-all-configs'),
  getDefaultLLMConfig: () => ipcRenderer.invoke('llm-get-default-config'),
  getLLMConfigById: (id) => ipcRenderer.invoke('llm-get-config-by-id', id),
  deleteLLMConfig: (id) => ipcRenderer.invoke('llm-delete-config', id),
  testLLMConnection: (configData) => ipcRenderer.invoke('llm-test-connection', configData),
  setDefaultLLMConfig: (id) => ipcRenderer.invoke('llm-set-default-config', id),

  // ASR（语音识别）API
  asrInitialize: (conversationId) => ipcRenderer.invoke('asr-initialize', conversationId),
  asrStart: (conversationId) => ipcRenderer.invoke('asr-start', conversationId),
  asrStop: () => ipcRenderer.invoke('asr-stop'),
  asrGetConfigs: () => ipcRenderer.invoke('asr-get-configs'),
  asrCreateConfig: (configData) => ipcRenderer.invoke('asr-create-config', configData),
  asrUpdateConfig: (id, updates) => ipcRenderer.invoke('asr-update-config', id, updates),
  asrSetDefaultConfig: (id) => ipcRenderer.invoke('asr-set-default-config', id),
  asrGetAudioSources: () => ipcRenderer.invoke('asr-get-audio-sources'),
  asrCreateAudioSource: (sourceData) => ipcRenderer.invoke('asr-create-audio-source', sourceData),
  asrUpdateAudioSource: (id, updates) => ipcRenderer.invoke('asr-update-audio-source', id, updates),
  asrGetSpeechRecords: (conversationId) => ipcRenderer.invoke('asr-get-speech-records', conversationId),
  asrConvertToMessage: (recordId, conversationId) => ipcRenderer.invoke('asr-convert-to-message', recordId, conversationId),
  asrCleanupAudioFiles: (retentionDays) => ipcRenderer.invoke('asr-cleanup-audio-files', retentionDays)
});

// 监听主进程消息
ipcRenderer.on('window-focused', () => {
  logger.log('Window focused');
});

logger.log('Preload script loaded successfully');
