import * as logger from '../utils/logger.js';

export function createSentenceHandlers(manager) {
  // 仅用于 cloud 模式：云端可能返回“增量片段”而非“累积全文”，直接覆盖会导致前文丢失
  const mergeIncrementalText = (prevText, nextText) => {
    const prev = (prevText || '').trim();
    const next = (nextText || '').trim();
    if (!prev) return next;
    if (!next) return prev;
    if (next.includes(prev)) return next; // 累积全文
    if (prev.includes(next)) return prev; // 回退/截断，保留更长的

    const maxOverlap = Math.min(prev.length, next.length, 80);
    for (let k = maxOverlap; k >= 1; k--) {
      if (prev.slice(-k) === next.slice(0, k)) {
        return prev + next.slice(k);
      }
    }

    // 无明显重叠：根据字符类型决定是否插入空格（主要处理英文/数字）
    const last = prev[prev.length - 1];
    const first = next[0];
    const needSpace = /[A-Za-z0-9]$/.test(last) && /^[A-Za-z0-9]/.test(first);
    return prev + (needSpace ? ' ' : '') + next;
  };

  const handleSentenceComplete = async (result) => {
    try {
      const {
        sessionId,
        text,
        timestamp,
        trigger,
        audioDuration,
        isSegmentEnd,
        sentenceIndex,  // 新增：当前句子在序列中的索引
        totalSentences  // 新增：总句子数量
      } = result;

      const sentenceIdx = sentenceIndex ?? result.sentence_index ?? 0;
      const totalSents = totalSentences ?? result.total_sentences ?? 1;
      const isMultiSentence = totalSents > 1;

      if (isMultiSentence && sentenceIdx > 0) {
        logger.log(`[Sentence Complete] Multi-sentence mode: sentence ${sentenceIdx + 1}/${totalSents}`);
        manager.commitCurrentSegment(sessionId);
      }

      if (isSegmentEnd) {
        logger.log(`[Sentence Complete] Segment end signal received for ${sessionId}`);
        if (!text) {
          manager.commitCurrentSegment(sessionId);
          return null;
        }
      }

      if (!text || !text.trim()) {
        logger.log('[Sentence Complete] Empty text, skipping.');
        if (isSegmentEnd) {
          manager.commitCurrentSegment(sessionId);
        }
        return null;
      }

      const normalizedText = manager.normalizeText(text);
      if (!normalizedText) {
        logger.log('[Sentence Complete] Normalized text empty, skipping.');
        return null;
      }

      const currentSegment = manager.currentSegments.get(sessionId);
      const effectiveTimestamp = timestamp || Date.now();

      if (currentSegment && currentSegment.messageId) {
        const isCloudModel = String(manager.modelName || '').includes('cloud');
        let effectiveText = normalizedText;

        if (isCloudModel) {
          // 云端模式：智能拼接新段落（每段独立返回）
          // 检查是否是重复内容（新文本包含了旧文本）
          if (normalizedText.includes(currentSegment.lastText)) {
            // 云端返回的是累积文本，直接使用
            effectiveText = normalizedText;
          } else if (currentSegment.lastText.includes(normalizedText)) {
            // 新文本是旧文本的子集，保留旧的
            logger.log(`[Sentence Complete] New text is subset of old, skipping update`);
            return null;
          } else {
            // 完全不同的文本，拼接（用空格分隔）
            effectiveText = currentSegment.lastText + ' ' + normalizedText;
          }
        } else {
          // 本地模式（FunASR）：直接替换
          // FunASR 的 Pass 2 每次都是对整段音频重新识别，结果是完整的，直接替换即可
          effectiveText = normalizedText;
        }

        if (currentSegment.lastText === effectiveText) {
          logger.log(`[Sentence Complete] Text unchanged, skipping update: "${normalizedText.substring(0, 30)}..."`);
          return null;
        }

        logger.log(`[Sentence Complete] Updating existing message ${currentSegment.messageId}: "${effectiveText.substring(0, 50)}..." (trigger: ${trigger})`);

        const updatedRecord = manager.db.updateSpeechRecord(currentSegment.recordId, {
          recognized_text: effectiveText,
          end_time: effectiveTimestamp,
          audio_duration: audioDuration || (effectiveTimestamp - (currentSegment.startTime || effectiveTimestamp)) / 1000
        });

        if (!updatedRecord) {
          logger.error(`[Sentence Complete] Failed to update speech record: ${currentSegment.recordId}`);
          return null;
        }

        const updatedMessage = manager.db.updateMessage(currentSegment.messageId, {
          content: effectiveText
        });

        if (!updatedMessage) {
          logger.error(`[Sentence Complete] Failed to update message: ${currentSegment.messageId}`);
          return null;
        }

        currentSegment.lastText = effectiveText;
        manager.currentSegments.set(sessionId, currentSegment);

        if (manager.eventEmitter) {
          updatedMessage.source_id = sessionId;
          manager.eventEmitter('asr-sentence-update', updatedMessage);
        }

        manager.enqueuePunctuationUpdate({
          recordId: currentSegment.recordId,
          messageId: currentSegment.messageId,
          text: effectiveText,
          sourceId: sessionId
        });

        if (isSegmentEnd) {
          logger.log(`[Sentence Complete] Committing segment after update: ${sessionId}`);
          manager.commitCurrentSegment(sessionId);
        }

        return updatedMessage;
      }

      logger.log(`[Sentence Complete] Creating new message: "${normalizedText.substring(0, 50)}..." (trigger: ${trigger}, session: ${sessionId})`);

      const record = await manager.saveRecognitionRecord(sessionId, {
        text: normalizedText,
        confidence: trigger === 'punctuation' ? 0.98 : 0.95,
        startTime: effectiveTimestamp - (audioDuration || manager.SILENCE_TIMEOUT),
        endTime: effectiveTimestamp,
        audioDuration: audioDuration || manager.SILENCE_TIMEOUT / 1000,
        isPartial: false,
        audioData: null
      });

      if (!record) {
        logger.error(`[Sentence Complete] Failed to save record for: "${normalizedText}"`);
        return null;
      }

      manager.addToRecognitionCache(sessionId, normalizedText, effectiveTimestamp);

      const message = await manager.convertRecordToMessage(record.id, manager.currentConversationId);
      message.source_id = sessionId;
      logger.log(`[Sentence Complete] Message created: ${message.id}`);

      manager.currentSegments.set(sessionId, {
        messageId: message.id,
        recordId: record.id,
        lastText: normalizedText,
        startTime: effectiveTimestamp - (audioDuration || manager.SILENCE_TIMEOUT)
      });

      if (manager.eventEmitter) {
        logger.log(`[Sentence Complete] Sending event to renderer: ${message.id}`);
        manager.clearStreamingSegment(sessionId);
        manager.eventEmitter('asr-sentence-complete', message);
      } else {
        logger.warn('[Sentence Complete] No event emitter set, UI will not update in real-time');
      }

      manager.enqueuePunctuationUpdate({
        recordId: record.id,
        messageId: message.id,
        text: normalizedText,
        sourceId: sessionId
      });

      const pendingTimer = manager.silenceTimers.get(sessionId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        manager.silenceTimers.delete(sessionId);
      }

      if (isSegmentEnd) {
        logger.log(`[Sentence Complete] Committing segment after creating message: ${sessionId}`);
        manager.commitCurrentSegment(sessionId);
      }

      return message;
    } catch (error) {
      logger.error('[Sentence Complete] Error:', error);
      return null;
    }
  };

  const handlePartialResult = (result) => {
    try {
      const { sessionId, partialText, fullText, timestamp } = result;

      if (!partialText && !fullText) {
        return;
      }

      const normalizedPartial = manager.normalizeText(fullText || partialText || '');
      if (!normalizedPartial) {
        return;
      }

      const existingTimer = manager.silenceTimers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      manager.isSpeaking = true;

      const timer = setTimeout(() => manager.triggerSilenceCommit(sessionId), manager.SILENCE_TIMEOUT);
      manager.silenceTimers.set(sessionId, timer);

      const effectiveTimestamp = timestamp || Date.now();
      manager.emitStreamingUpdate(sessionId, normalizedPartial, effectiveTimestamp);
    } catch (error) {
      logger.error('[Partial Result] Error:', error);
    }
  };

  return { handleSentenceComplete, handlePartialResult };
}
