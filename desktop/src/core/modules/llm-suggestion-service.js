import { buildSuggestionContext } from './suggestion-context-builder.js';
import { createToonSuggestionStreamParser } from './toon-parser.js';

const MIN_SUGGESTION_COUNT = 2;
const MAX_SUGGESTION_COUNT = 5;
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_SITUATION_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 1000 * 15;
const STREAM_TIMEOUT_MS = 1000 * 30;
const DEFAULT_SITUATION_TIMEOUT_MS = 1000 * 5;

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
      messageLimit,
      previousSuggestions = []
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
      context,
      previousSuggestions
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
    let rawStreamContent = '';

    console.log('[LLMSuggestionService] Creating TOON parser');
    const parser = createToonSuggestionStreamParser({
      onHeader: (header) => {
        console.log('[LLMSuggestionService] Parser received header:', header);
        handlers.onHeader?.(header);
      },
      onPartialSuggestion: (partial) => {
        handlers.onPartialSuggestion?.({
          index: emittedCount,
          suggestion: partial
        });
      },
      onSuggestion: (item) => {
        console.log(`[LLMSuggestionService] Parser received suggestion #${emittedCount + 1}:`, item);
        const suggestionIndex = emittedCount;
        const suggestion = this.decorateSuggestion(item, emittedCount, { trigger, reason });
        suggestion.index = suggestionIndex;
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
          rawStreamContent += String(delta);
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
      console.log('[LLMSuggestionService] Full streamed content:\n', rawStreamContent);

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
        },
        rawStreamContent
      });
      throw error;
    } finally {
      console.log('[LLMSuggestionService] Clearing timeout');
      clearTimeout(timeoutId);
    }
  }

  buildSuggestionPrompt({ count, trigger, reason, context, previousSuggestions = [] }) {
    const triggerLabel = trigger === 'manual' ? '用户主动请求' : `系统被动触发（原因：${reason}）`;
    const triggerGuidance = {
      manual: '用户主动求助：提供多元策略（保守/进取/幽默/共情），帮助选择其一。',
      silence: '静默提醒：给破冰/延续话题的轻量提示，降低冷场尴尬。',
      message_count: '角色多条未回：提炼关键点，给一条综合回应思路，包含确认/回应/再提问。',
      topic_change: '话题转折或被提问：先回应问题/态度，再给推进话题的具体方向。'
    }[trigger] || '按通用策略生成多样化可选方案。';

    const affinityStageText = context.affinityStage?.label
      ? `${context.affinityStage.label}：${context.affinityStage.strategy}`
      : '好感阶段未知：保持礼貌与真诚。';

    const emotionText = context.emotion?.label
      ? `最后一条角色消息情感：${context.emotion.label}（${context.emotion.reason || '推测'}）`
      : '最后消息情感：中性';

    const previousList = Array.isArray(previousSuggestions)
      ? previousSuggestions.filter((item) => item && (item.title || item.content))
      : [];
    const previousSuggestionText = previousList.length
      ? [
          '【用户反馈】上一批建议未被采纳，用户要求换一批，请给出明显不同的新思路，避免重复或轻微改写。',
          '【上一批建议（仅供去同质化参考）】',
          ...previousList.slice(0, 5).map((item, index) => {
            const tagsText = Array.isArray(item.tags) && item.tags.length ? ` [${item.tags.join('、')}]` : '';
            return `${index + 1}. ${item.title || '未命名'}：${item.content || ''}${tagsText}`;
          })
        ].join('\n')
      : null;

    return [
      `【触发方式】${triggerLabel}`,
      `【触发策略指导】${triggerGuidance}`,
      `【角色信息】${context.characterProfile}`,
      `【好感阶段策略】${affinityStageText}`,
      '【对话历史】',
      context.historyText,
      `【情感分析】${emotionText}`,
      ...(previousSuggestionText ? [previousSuggestionText] : []),
      `【输出要求】`,
      `- 仅输出 TOON 格式，禁止任何解释、前缀、后缀或代码块，特别禁止输出「好的/以下是/结果如下」等冗余文本`,
      `- 第一行必须直接是表头：suggestions[${count}]{suggestion,tags}:（前后不能有其他字符或空行）`,
      `- 在表头下方，每行依次填写一个选项，字段之间必须使用英文逗号(,)分隔`,
      `- 生成 ${count} 个选项，每个包含：suggestion（1-2 句话的详细可执行思路/话术，结合角色喜好/忌讳与情感状态）、tags（2-3 个策略标签，使用顿号/逗号分隔）`,
      `- 选项必须覆盖不同策略维度：至少包含保守稳妥、积极进取、轻松幽默/共情中的若干，不要同质化`,
      `- 严格结合触发方式：静默→破冰与轻量延续；消息累积→综合回应要点；话题转折→先回应问题/态度再推进；主动→多元供选`,
      `- 严格结合角色档案：投其所好、避开忌讳，符合性格（内向勿过猛）与好感阶段边界`,
      `- 如果提供了上一批建议，务必生成不同方向的新选项，避免与列表雷同或轻微改写`,
      `- 不要直接代替玩家发言；不要输出泛化空话（如“多聊聊”“继续沟通”）；不要复述历史；不编造不存在的事实`,
      `- 如果信息不足，也要给可行的引导，而不是返回空`,
      `【示例（仅参考，不要输出示例本身）】`,
      '```toon',
      '示例1 初识破冰/静默：',
      'suggestions[3]{suggestion,tags}:',
      '用一句轻松的自我揭示开场，请她点评,"破冰,轻松"',
      '提到她喜欢的音乐/电影并请她推荐最新的一首,"投其所好,互动"',
      '针对她刚提到的细节表达共情再抛一个相关问题,"细节共情,延续"',
      '示例2 角色提问/话题转折：',
      'suggestions[3]{suggestion,tags}:',
      '先正面回应她的问题，再补充你的看法并收个问句,"回应,态度明确"',
      '复述她关心点表达理解，再抛一个轻问题引她说更多,"共情,确认"',
      '给一个可执行的小提议并询问她意愿,"推进,邀请"',
      '示例3 暧昧升温（中好感）：',
      'suggestions[3]{suggestion,tags}:',
      '针对她的优点给真诚夸奖并留白等待回应,"夸赞,暧昧"',
      '提议一起做她喜欢的事并询问合适时间,"计划,邀请"',
      '用轻松幽默回应保持轻快氛围，别过猛,"幽默,轻松"',
      '```'
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
    const suggestionText = item.suggestion || item.title || item.content || `选项 ${index + 1}`;
    return {
      id: suggestionId,
      title: suggestionText,
      content: suggestionText,
      tags,
      // affinity_hint: item.affinity_hint || null,
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

  analyzeHeuristics() {
    // 关键词启发式已禁用，直接放行由 LLM 判断
    return { shouldCheck: true, reason: 'disabled', features: null };
  }

  clampConfidence(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return Math.min(1, Math.max(0, value));
  }

  buildSituationPrompt(context, heuristicResult) {
    return [
      '你是 situation_llm，负责快速判定当前对话是否需要立即生成回复选项。',
      '请只输出 JSON：{"should_intervene":true/false,"need_options":true/false,"trigger":"question|invite|message_burst|other","reason":"简短中文","confidence":0-1}',
      '规则：提出问题/邀约/安排/确认/期待 → need_options=true；纯闲聊无决策点 → false；不确定时倾向 false。',
      `【角色信息】${context.characterProfile}`,
      '【对话历史】',
      context.historyText
    ].join('\n');
  }

  async evaluateSituation(payload = {}) {
    const { conversationId, characterId, messageLimit = 6 } = payload;
    const suggestionConfig = this.db.getSuggestionConfig();
    const llmEnabled = suggestionConfig?.situation_llm_enabled ?? suggestionConfig?.topic_detection_enabled;
    if (!llmEnabled) {
      return { shouldSuggest: false, shouldIntervene: false, reason: 'situation_llm_disabled' };
    }

    const context = buildSuggestionContext(this.db, {
      conversationId,
      characterId,
      messageLimit: Math.min(messageLimit, 8)
    });

    const history = context.history || [];
    if (!history.length) {
      return { shouldSuggest: false, shouldIntervene: false, reason: 'no_history' };
    }

    const heuristicResult = this.analyzeHeuristics();

    const client = await this.ensureClient();
    const modelName = this.resolveSituationModelName(this.currentLLMConfig, suggestionConfig);
    const prompt = this.buildSituationPrompt(context, heuristicResult);

    const requestParams = {
      model: modelName,
      temperature: 0,
      max_tokens: 120,
      messages: [
        {
          role: 'system',
          content: '你是实时对话决策器，只返回 JSON，不输出任何其他文字。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    let response;
    try {
      console.log('Situation LLM Request Debug Info:', {
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
        DEFAULT_SITUATION_TIMEOUT_MS
      );
    } catch (error) {
      console.error('Situation LLM Request Failed - Full Debug Info:', {
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
    const parsed = this.extractJSON(raw) || {};
    const shouldIntervene = Boolean(parsed.should_intervene ?? parsed.should_suggest ?? parsed.need_options);
    const needOptions = Boolean(parsed.need_options ?? parsed.should_suggest ?? parsed.should_intervene);

    return {
      shouldIntervene,
      shouldSuggest: needOptions,
      needOptions,
      trigger: parsed.trigger || 'auto',
      reason: parsed.reason || 'llm_evaluation',
      confidence: this.clampConfidence(parsed.confidence),
      features: null,
      model: modelName
    };
  }

  async detectTopicShift(payload = {}) {
    const result = await this.evaluateSituation(payload);
    return {
      shouldSuggest: result.shouldSuggest,
      reason: result.reason,
      trigger: result.trigger,
      confidence: result.confidence,
      features: result.features || null,
      model: result.model
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

  resolveSituationModelName(llmConfig, suggestionConfig) {
    const situationModel = suggestionConfig?.situation_model_name && suggestionConfig.situation_model_name.trim();
    if (situationModel) {
      return situationModel;
    }
    return this.resolveModelName(llmConfig, suggestionConfig) || DEFAULT_SITUATION_MODEL;
  }
}
