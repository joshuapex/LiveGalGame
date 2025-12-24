import { ipcMain } from 'electron';

/**
 * 注册数据库相关 IPC 处理器
 * @param {object} deps
 * @param {object} deps.db
 */
export function registerDatabaseHandlers({ db }) {
  ipcMain.handle('db-get-all-characters', () => {
    try {
      return db.getAllCharacters();
    } catch (error) {
      console.error('Error getting all characters:', error);
      return [];
    }
  });

  ipcMain.handle('db-get-character-by-id', (event, id) => {
    try {
      return db.getCharacterById(id);
    } catch (error) {
      console.error('Error getting character:', error);
      return null;
    }
  });

  ipcMain.handle('db-create-character', (event, characterData) => {
    try {
      return db.createCharacter(characterData);
    } catch (error) {
      console.error('Error creating character:', error);
      return null;
    }
  });

  ipcMain.handle('db-create-conversation', (event, conversationData) => {
    try {
      return db.createConversation(conversationData);
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  });

  ipcMain.handle('db-get-conversations-by-character', (event, characterId) => {
    try {
      return db.getConversationsByCharacter(characterId);
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  });

  ipcMain.handle('db-create-message', (event, messageData) => {
    try {
      return db.createMessage(messageData);
    } catch (error) {
      console.error('Error creating message:', error);
      return null;
    }
  });

  ipcMain.handle('db-get-messages-by-conversation', (event, conversationId) => {
    try {
      return db.getMessagesByConversation(conversationId);
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  });

  ipcMain.handle('db-update-conversation', (event, conversationId, updates) => {
    try {
      return db.updateConversation(conversationId, updates);
    } catch (error) {
      console.error('Error updating conversation:', error);
      return null;
    }
  });

  ipcMain.handle('db-get-statistics', () => {
    try {
      return db.getStatistics();
    } catch (error) {
      try {
        console.error('Error getting statistics:', error);
      } catch (logError) {
        // ignore secondary logging errors
      }
      return {
        characterCount: 0,
        conversationCount: 0,
        messageCount: 0,
        avgAffinity: 0
      };
    }
  });

  ipcMain.handle('db-get-character-page-statistics', () => {
    try {
      return db.getCharacterPageStatistics();
    } catch (error) {
      console.error('Error getting character page statistics:', error);
      return {
        characterCount: 0,
        activeConversationCount: 0,
        avgAffinity: 0
      };
    }
  });

  ipcMain.handle('db-get-recent-conversations', (event, limit) => {
    try {
      return db.getRecentConversations(limit || 10);
    } catch (error) {
      console.error('Error getting recent conversations:', error);
      return [];
    }
  });

  ipcMain.handle('db-get-all-conversations', () => {
    try {
      return db.getAllConversations();
    } catch (error) {
      console.error('Error getting all conversations:', error);
      return [];
    }
  });

  ipcMain.handle('db-get-conversation-by-id', (event, conversationId) => {
    try {
      return db.getConversationById(conversationId);
    } catch (error) {
      console.error('Error getting conversation by id:', error);
      return null;
    }
  });

  ipcMain.handle('db-update-message', (event, messageId, updates) => {
    try {
      return db.updateMessage(messageId, updates);
    } catch (error) {
      console.error('Error updating message:', error);
      return null;
    }
  });

  ipcMain.handle('db-get-conversation-ai-data', (event, conversationId) => {
    try {
      return db.getConversationAIData(conversationId);
    } catch (error) {
      console.error('Error getting conversation AI data:', error);
      return {
        analysisReport: null,
        keyMoments: [],
        personalityAnalysis: null,
        actionSuggestions: []
      };
    }
  });

  ipcMain.handle('db-select-action-suggestion', (event, payload = {}) => {
    try {
      return db.selectActionSuggestion(payload);
    } catch (error) {
      console.error('Error selecting action suggestion:', error);
      return false;
    }
  });

  ipcMain.handle('db-get-character-details', (event, characterId) => {
    try {
      return db.getCharacterDetails(characterId);
    } catch (error) {
      console.error('Error getting character details:', error);
      return null;
    }
  });

  ipcMain.handle(
    'db-update-character-details-custom-fields',
    (event, characterId, customFields) => {
      try {
        return db.updateCharacterDetailsCustomFields(characterId, customFields);
      } catch (error) {
        console.error('Error updating character details custom fields:', error);
        return false;
      }
    }
  );

  ipcMain.handle('db-regenerate-character-details', (event, characterId) => {
    try {
      return db.generateCharacterDetailsFromConversations(characterId);
    } catch (error) {
      console.error('Error regenerating character details:', error);
      return null;
    }
  });

  ipcMain.handle('db-delete-conversation', (event, conversationId) => {
    try {
      return db.deleteConversation(conversationId);
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  });

  ipcMain.handle('db-delete-character', (event, characterId) => {
    try {
      return db.deleteCharacter(characterId);
    } catch (error) {
      console.error('Error deleting character:', error);
      return false;
    }
  });

  console.log('Database IPC handlers registered');
}
