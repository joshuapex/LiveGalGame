import WebSocket from 'ws';
import * as logger from '../utils/logger.js';

class FastAPISession {
  constructor(ws, sourceId, onSentence, onPartial) {
    this.ws = ws;
    this.sourceId = sourceId;
    this.onSentence = onSentence;
    this.onPartial = onPartial;
    this.bind();
  }

  setCallbacks(onSentence, onPartial) {
    this.onSentence = onSentence;
    this.onPartial = onPartial;
  }

  bind() {
    this.ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (!payload) return;
        if (payload.type === 'sentence_complete' && this.onSentence) {
          this.onSentence({
            sessionId: payload.session_id || this.sourceId,
            text: payload.text,
            timestamp: payload.timestamp,
            trigger: payload.trigger || 'asr',
            audioDuration: payload.audio_duration,
            language: payload.language,
            isSegmentEnd: payload.isSegmentEnd || payload.is_segment_end,
            sentenceIndex: payload.sentence_index,
            totalSentences: payload.total_sentences,
            rawText: payload.raw_text,
            startTime: payload.start_time,
            endTime: payload.end_time,
          });
        } else if (payload.type === 'partial' && this.onPartial) {
          this.onPartial({
            sessionId: payload.session_id || this.sourceId,
            partialText: payload.text,
            fullText: payload.full_text,
            timestamp: payload.timestamp,
            isSpeaking: true,
          });
        }
      } catch (error) {
        logger.warn('[ASR][WS] Failed to parse message:', error);
      }
    });
  }

  sendAudio(buffer) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
  }

  sendControl(payload) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  reset() {
    this.sendControl({ type: 'reset_session' });
  }

  close() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }
  }
}

export default FastAPISession;

