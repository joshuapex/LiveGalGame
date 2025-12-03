import { buildSuggestionContext } from './suggestion-context-builder.js';
import { createToonSuggestionStreamParser } from './toon-parser.js';

const MIN_SUGGESTION_COUNT = 2;
const MAX_SUGGESTION_COUNT = 5;
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 1000 * 15;
const STREAM_TIMEOUT_MS = 1000 * 30;

const QUESTION_KEYWORDS = ['吗', '呢', '怎么', '为何', '可以', '能否', '要不要', '愿不愿意', '想不想', '行不行'];

export default class LLMSuggestionService {
  constructor(dbGetter) {
    this.dbGetter = dbGetter;
    this.client = null;
    this.clientConfigSignature = null;
    this.currentLLMConfig = null;
  }

  get db() {
    const db = this.dbGetter?.();
    if (!db) {
      throw new Error('Database is not initialized');
    }
    return db;
  }

  async ensureClient() {
    const llmConfig = this.db.getDefaultLLMConfig();
    if (!llmConfig) {
      throw new Error('未找到默认LLM配置，请先在设置中配置。');
    }

    const signature = `${llmConfig.id || 'unknown'}-${llmConfig.updated_at || 0}`;
    if (!this.client || this.clientConfigSignature !== signature) {
      const { default: OpenAI } = await import('openai');
      const clientConfig = { apiKey: llmConfig.api_key };
      if (llmConfig.base_url) {
        // Remove trailing '/chat/completions' if present
        const baseURL = llmConfig.base_url.replace(/\/chat\/completions\/?$/, '');
        clientConfig.baseURL = baseURL;
      }
      this.client = new OpenAI(clientConfig);
      this.clientConfigSignature = signature;
    }

    this.currentLLMConfig = llmConfig;
    return this.client;
  }

  sanitizeCount(value, fallback) {
    const num = Number(value ?? fallback ?? MIN_SUGGESTION_COUNT);
    if (Number.isNaN(num)) return MIN_SUGGESTION_COUNT;
    return Math.min(MAX_SUGGESTION_COUNT, Math.max(MIN_SUGGESTION_COUNT, Math.round(num)));
  }

  async generateSuggestions(payload = {}) {
    const collected = [];
    let metadata = null;
    await this.generateSuggestionsStream(payload, {
      onSuggestion: (suggestion) => {
        collected.push(suggestion);
      },
      onComplete: (info) => {
        metadata = info;
      }
    });
    return { suggestions: collected, metadata };
  }

  async generateSuggestionsStream(payload = {}, handlers = {}) {
    const {
      conversationId,
      characterId,
      trigger = 'manual',
      reason = 'manual',
      optionCount,
      messageLimit
    } = payload;

    if (!conversationId && !characterId) {
      throw new Error('缺少会话或角色信息，无法生成建议。');
    }

    const suggestionConfig = this.db.getSuggestionConfig();
    const count = this.sanitizeCount(optionCount ?? suggestionConfig?.suggestion_count, 3);
    const contextLimit = messageLimit || suggestionConfig?.context_message_limit || 10;
    const client = await this.ensureClient();
    const modelName = this.resolveModelName(this.currentLLMConfig, suggestionConfig);

    const context = buildSuggestionContext(this.db, {
      conversationId,
      characterId,
      messageLimit: contextLimit
    });

    const prompt = this.buildSuggestionPrompt({
      count,
      trigger,
      reason,
      context
    });

    const requestParams = {
      model: modelName,
      temperature: trigger === 'manual' ? 0.8 : 0.6,
      max_tokens: 600,
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            '你是一个恋爱互动教练，负责根据当前对话状态，为玩家提供下一步回复的“话题方向 + 简要提示”。' +
            '请保持中文输出，语气自然友好。只输出 TOON 格式，遵循用户提供的表头，不要添加 JSON。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    console.log('[LLMSuggestionService] Starting stream with payload:', payload);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[LLMSuggestionService] Stream timed out after', STREAM_TIMEOUT_MS, 'ms');
      abortController.abort(new Error('LLM生成超时，请稍后重试'));
    }, STREAM_TIMEOUT_MS);

    let usageInfo = null;
    let emittedCount = 0;
    let chunkCount = 0;
    let totalContentLength = 0;

    console.log('[LLMSuggestionService] Creating TOON parser');
    const parser = createToonSuggestionStreamParser({
      onHeader: (header) => {
        console.log('[LLMSuggestionService] Parser received header:', header);
        handlers.onHeader?.(header);
      },
      onSuggestion: (item) => {
        console.log(`[LLMSuggestionService] Parser received suggestion #${emittedCount + 1}:`, item);
        const suggestion = this.decorateSuggestion(item, emittedCount, { trigger, reason });
        console.log(`[LLMSuggestionService] Decorated suggestion:`, suggestion);
        emittedCount += 1;
        handlers.onSuggestion?.(suggestion);
      },
      onError: (error) => {
        console.error('[LLMSuggestionService] Parser error:', error);
        handlers.onParserError?.(error);
      }
    });

    try {
      console.log('[LLMSuggestionService] Calling onStart handler');
      handlers.onStart?.({
        trigger,
        reason,
        expectedCount: count
      });

      console.log('LLM Suggestion Stream Request Debug Info:', {
        payload,
        llmConfig: {
          id: this.currentLLMConfig.id,
          name: this.currentLLMConfig.name,
          base_url: this.currentLLMConfig.base_url,
          model_name: this.currentLLMConfig.model_name
        },
        requestParams
      });

      console.log('[LLMSuggestionService] Creating OpenAI stream...');
      const stream = await client.chat.completions.create({
        ...requestParams,
        signal: abortController.signal
      });
      console.log('[LLMSuggestionService] OpenAI stream created successfully');

      console.log('[LLMSuggestionService] Starting to process chunks...');
      for await (const chunk of stream) {
        chunkCount++;
        const delta = chunk?.choices?.[0]?.delta?.content;
        console.log(`[LLMSuggestionService] Processing chunk #${chunkCount}:`, {
          hasContent: !!delta,
          contentLength: delta?.length || 0,
          finishReason: chunk?.choices?.[0]?.finish_reason,
          hasUsage: !!chunk?.usage
        });

        if (delta) {
          totalContentLength += delta.length;
          console.log(
            `[LLMSuggestionService] Raw delta content (${delta.length} chars): "${String(delta).replace(/\n/g, '\\n')}"`
          );
          for (let i = 0; i < delta.length; i += 1) {
            console.log(
              `[LLMSuggestionService] delta char #${i}: "${String(delta[i]).replace(/\n/g, '\\n')}"`
            );
          }
          console.log('[LLMSuggestionService] Pushing content to parser...');
          parser.push(delta);
        }

        if (chunk?.choices?.[0]?.finish_reason) {
          console.log(`[LLMSuggestionService] Stream finished with reason: ${chunk.choices[0].finish_reason}`);
          parser.end();
        }

        if (chunk?.usage) {
          console.log('[LLMSuggestionService] Received usage info:', chunk.usage);
          usageInfo = chunk.usage;
        }
      }

      console.log(`[LLMSuggestionService] Stream processing complete. Total chunks: ${chunkCount}, total content: ${totalContentLength} chars, emitted suggestions: ${emittedCount}`);

      console.log('[LLMSuggestionService] Calling parser.end() manually');
      parser.end();

      console.log('[LLMSuggestionService] Calling onComplete handler');
      handlers.onComplete?.({
        trigger,
        reason,
        model: modelName,
        tokenUsage: usageInfo,
        contextMessages: context.history?.length || 0
      });

      console.log('[LLMSuggestionService] Stream completed successfully');
    } catch (error) {
      console.error('[LLMSuggestionService] Stream failed, calling onError handler');
      handlers.onError?.(error);

      console.error('LLM Suggestion Stream Failed - Full Debug Info:', {
        error: {
          message: error.message,
          status: error.status,
          code: error.code,
          type: error.type,
          param: error.param,
          headers: error.headers,
          requestID: error.requestID
        },
        payload,
        llmConfig: {
          id: this.currentLLMConfig.id,
          name: this.currentLLMConfig.name,
          base_url: this.currentLLMConfig.base_url,
          model_name: this.currentLLMConfig.model_name
        },
        requestParams,
        contextInfo: {
          conversationId,
          characterId,
          messageLimit: contextLimit,
          contextHistoryLength: context.history?.length || 0
        },
        streamStats: {
          chunkCount,
          totalContentLength,
          emittedCount
        }
      });
      throw error;
    } finally {
      console.log('[LLMSuggestionService] Clearing timeout');
      clearTimeout(timeoutId);
    }
  }

  buildSuggestionPrompt({ count, trigger, reason, context }) {
    const triggerLabel = trigger === 'manual' ? '用户主动请求' : `系统被动触发（原因：${reason}）`;
    return [
      `【触发方式】${triggerLabel}`,
      `【角色信息】${context.characterProfile}`,
      '【对话历史】',
      context.historyText,
      `【输出要求】`,
      `- 仅输出 TOON 格式，不要输出 JSON 或解释性语言`,
      `- 表头必须为：suggestions[${count}]{title,content,tags,affinity_hint}:`,
      `- 在表头下方，每行依次填写一个选项，字段之间用逗号分隔，示例：`,
      '```toon',
      'suggestions[2]{title,content,tags,affinity_hint}:',
      '关心近况,询问她今天过得怎么样以延续聊天,"关心,延续",可能增加好感',
      '制造轻松氛围,用幽默回应让对话不尴尬,"幽默,轻松",持平或略增',
      '```',
      `- 生成 ${count} 个选项，每个包含 title（话题方向）、content（50字以内详细提示）、tags（2-3个策略标签，使用顿号/逗号分隔）、affinity_hint（可选，说明可能的好感度影响）`,
      '- 建议应具体且紧贴当前语境，不要直接代替用户发言，只给策略提示',
      '- 如果没有足够信息，仍需根据已有内容给出引导，而不是返回空'
    ].join('\n');
  }

  extractJSON(text = '') {
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  decorateSuggestion(item, index, { trigger, reason }) {
    const suggestionId = `llm-suggestion-${Date.now()}-${index}`;
    const tags = Array.isArray(item.tags)
      ? item.tags.slice(0, 3)
      : typeof item.tags === 'string'
        ? item.tags.split(/[,，、]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 3)
        : [];
    return {
      id: suggestionId,
      title: item.title || `选项 ${index + 1}`,
      content: item.content || '',
      tags,
      affinity_hint: item.affinity_hint || null,
      trigger,
      reason
    };
  }

  runWithTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('LLM生成超时，请稍后重试'));
      }, timeoutMs);
    });

    return Promise.race([
      promise.finally(() => clearTimeout(timeoutId)),
      timeoutPromise
    ]);
  }

  analyzeHeuristics(message) {
    if (!message) {
      return { shouldCheck: false, reason: 'no_message' };
    }
    const content = (message.content || message.text || '').trim();
    if (!content) {
      return { shouldCheck: false, reason: 'empty_content' };
    }

    const hasQuestionMark = /[?？]/.test(content);
    const keywordHit = QUESTION_KEYWORDS.some((keyword) => content.includes(keyword));
    const lengthy = content.length > 18;
    const containsInvite = /(一起|要不要|可以|方便|安排|约|想不想|能|是否)/.test(content);

    const shouldCheck = hasQuestionMark || keywordHit || containsInvite;
    return {
      shouldCheck,
      reason: shouldCheck ? 'heuristic_positive' : 'heuristic_negative',
      features: { hasQuestionMark, keywordHit, lengthy, containsInvite }
    };
  }

  async detectTopicShift(payload = {}) {
    const { conversationId, characterId, messageLimit = 6 } = payload;
    const suggestionConfig = this.db.getSuggestionConfig();
    if (!suggestionConfig?.topic_detection_enabled) {
      return { shouldSuggest: false, reason: 'topic_detection_disabled' };
    }

    const context = buildSuggestionContext(this.db, {
      conversationId,
      characterId,
      messageLimit: Math.min(messageLimit, 8)
    });

    const history = context.history || [];
    if (!history.length) {
      return { shouldSuggest: false, reason: 'no_history' };
    }

    const lastCharacterMessage = [...history].reverse().find((msg) => msg.sender === 'character');
    const heuristicResult = this.analyzeHeuristics(lastCharacterMessage);
    if (!heuristicResult.shouldCheck) {
      return {
        shouldSuggest: false,
        reason: 'heuristic_rejected',
        features: heuristicResult.features || null
      };
    }

    const client = await this.ensureClient();
    const modelName = this.resolveModelName(this.currentLLMConfig, suggestionConfig);
    const prompt = [
      '请你判断玩家是否需要立即做出回应，或当前对话是否出现话题转折/需要关键回复。',
      '只输出JSON，格式为 {"should_suggest": true/false, "reason": "简要原因"}。',
      '如果对方提出问题、约定、邀请或表达期待，需要返回 true。',
      '如果内容只是陈述或闲聊，无需强制回复，返回 false。',
      '请结合下方的对话片段：',
      context.historyText
    ].join('\n');

    const requestParams = {
      model: modelName,
      temperature: 0.2,
      max_tokens: 150,
      messages: [
        {
          role: 'system',
          content: '你是对话分析器，负责判断是否需要尽快回复。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    let response;
    try {
      console.log('LLM Topic Detection Request Debug Info:', {
        payload,
        llmConfig: {
          id: this.currentLLMConfig.id,
          name: this.currentLLMConfig.name,
          base_url: this.currentLLMConfig.base_url,
          model_name: this.currentLLMConfig.model_name
        },
        requestParams
      });

      response = await this.runWithTimeout(
        client.chat.completions.create(requestParams),
        8000
      );
    } catch (error) {
      console.error('LLM Topic Detection Request Failed - Full Debug Info:', {
        error: {
          message: error.message,
          status: error.status,
          code: error.code,
          type: error.type,
          param: error.param,
          headers: error.headers,
          requestID: error.requestID
        },
        payload,
        llmConfig: {
          id: this.currentLLMConfig.id,
          name: this.currentLLMConfig.name,
          base_url: this.currentLLMConfig.base_url,
          model_name: this.currentLLMConfig.model_name
        },
        requestParams,
        contextInfo: {
          conversationId,
          characterId,
          messageLimit: Math.min(messageLimit, 8),
          contextHistoryLength: context.history?.length || 0
        }
      });
      throw error;
    }

    const raw = response?.choices?.[0]?.message?.content?.trim();
    const parsed = this.extractJSON(raw);
    if (!parsed) {
      return {
        shouldSuggest: false,
        reason: 'llm_parse_failed',
        features: heuristicResult.features || null
      };
    }

    return {
      shouldSuggest: Boolean(parsed.should_suggest),
      reason: parsed.reason || 'llm_evaluation',
      features: heuristicResult.features || null
    };
  }

  resolveModelName(llmConfig, suggestionConfig) {
    const llmModel = llmConfig?.model_name && llmConfig.model_name.trim();
    if (llmModel) {
      return llmModel;
    }
    const suggestionModel = suggestionConfig?.model_name && suggestionConfig.model_name.trim();
    if (suggestionModel) {
      return suggestionModel;
    }
    return DEFAULT_MODEL;
  }
}

