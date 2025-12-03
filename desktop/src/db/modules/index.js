import DatabaseBase from './base.js';
import CharacterManager from './character.js';
import ConversationManager from './conversation.js';
import MessageManager from './message.js';
import TagManager from './tag.js';
import AIAnalysisManager from './ai-analysis.js';
import CharacterDetailsManager from './character-details.js';
import LLMConfigManager from './llm-config.js';
import SuggestionConfigManager from './suggestion-config.js';
import ASRManager from './asr.js';
import Utils from './utils.js';

class DatabaseManager extends Utils(
  ASRManager(
    SuggestionConfigManager(
      LLMConfigManager(
        CharacterDetailsManager(
          AIAnalysisManager(
            TagManager(
              MessageManager(
                ConversationManager(
                  CharacterManager(DatabaseBase)
                )
              )
            )
          )
        )
      )
    )
  )
) {
  constructor(options = {}) {
    super(options);
  }
}

export default DatabaseManager;