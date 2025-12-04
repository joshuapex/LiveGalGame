import { ipcMain } from 'electron';

/**
 * 注册 LLM 建议相关 IPC 处理器
 * @param {object} deps
 * @param {object} deps.db
 * @param {object} deps.llmSuggestionService
 * @param {Function} deps.ensureSuggestionService
 */
export function registerSuggestionHandlers({ db, llmSuggestionService, ensureSuggestionService }) {
  ipcMain.handle('suggestion-get-config', () => {
    try {
      return db.getSuggestionConfig();
    } catch (error) {
      console.error('Error getting suggestion config:', error);
      return null;
    }
  });

  ipcMain.handle('suggestion-update-config', (event, updates) => {
    try {
      return db.updateSuggestionConfig(updates);
    } catch (error) {
      console.error('Error updating suggestion config:', error);
      throw error;
    }
  });

  ipcMain.handle('llm-generate-suggestions', async (event, payload = {}) => {
    try {
      ensureSuggestionService();
      return await llmSuggestionService.generateSuggestions(payload);
    } catch (error) {
      console.error('Error generating LLM suggestions:', error);
      throw error;
    }
  });

  ipcMain.on('llm-start-suggestion-stream', async (event, payload = {}) => {
    console.log('[IPCHandlers] Received llm-start-suggestion-stream request:', payload);
    const webContents = event.sender;
    const streamId = payload.streamId || `llm-suggestion-stream-${Date.now()}`;
    console.log(`[IPCHandlers] Assigned streamId: ${streamId}`);

    const send = (channel, data) => {
      console.log(`[IPCHandlers] Sending to renderer: ${channel}`, { streamId, ...data });
      if (webContents.isDestroyed()) {
        console.warn('[IPCHandlers] WebContents destroyed, cannot send event');
        return;
      }
      webContents.send(channel, { streamId, ...data });
    };

    try {
      console.log('[IPCHandlers] Initializing LLM suggestion service');
      ensureSuggestionService();

      console.log('[IPCHandlers] Starting streaming suggestion generation');
      await llmSuggestionService.generateSuggestionsStream(payload, {
        onStart: (info) => {
          console.log('[IPCHandlers] onStart callback triggered:', info);
          send('llm-suggestion-stream-start', info);
        },
        onHeader: (header) => {
          console.log('[IPCHandlers] onHeader callback triggered:', header);
          send('llm-suggestion-stream-header', header);
        },
        onPartialSuggestion: (chunk) => {
          console.log('[IPCHandlers] onPartialSuggestion callback triggered:', chunk);
          send('llm-suggestion-stream-partial', chunk);
        },
        onSuggestion: (suggestion) => {
          console.log('[IPCHandlers] onSuggestion callback triggered:', suggestion);
          send('llm-suggestion-stream-chunk', { suggestion, index: suggestion.index });
        },
        onParserError: (error) => {
          console.error('[IPCHandlers] onParserError callback triggered:', error);
          send('llm-suggestion-stream-error', { error: error.message || 'TOON解析失败' });
        },
        onComplete: (metadata) => {
          console.log('[IPCHandlers] onComplete callback triggered:', metadata);
          send('llm-suggestion-stream-end', { success: true, metadata });
        },
        onError: (error) => {
          console.error('[IPCHandlers] onError callback triggered:', error);
          send('llm-suggestion-stream-error', { error: error.message || '生成失败' });
        }
      });
      console.log('[IPCHandlers] Streaming suggestion generation completed successfully');
    } catch (error) {
      console.error('[IPCHandlers] Error in streaming suggestion generation:', error);
      send('llm-suggestion-stream-error', { error: error.message || '生成失败' });
    }
  });

  ipcMain.handle('llm-detect-topic-shift', async (event, payload = {}) => {
    try {
      ensureSuggestionService();
      return await llmSuggestionService.detectTopicShift(payload);
    } catch (error) {
      console.error('Error detecting topic shift:', error);
      throw error;
    }
  });

  console.log('[IPCHandlers] Suggestion handlers registered');
}

