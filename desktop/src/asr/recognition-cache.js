class RecognitionCache {
  constructor({ duplicateThreshold = 3000 } = {}) {
    this.duplicateThreshold = duplicateThreshold;
    this.cache = new Map(); // sourceId -> [{ text, timestamp }]
  }

  normalizeText(text) {
    if (!text) return '';
    let normalized = typeof text === 'string' ? text : String(text);
    normalized = normalized.replace(/([\u4E00-\u9FFF])\s+(?=[\u4E00-\u9FFF])/g, '$1');
    normalized = normalized.replace(/\s+([，。！？、,.!?])/g, '$1');
    normalized = normalized.replace(/([，。！？、,.!?])\s+/g, '$1');
    normalized = normalized.replace(/\s{2,}/g, ' ');
    return normalized.trim();
  }

  normalizeForComparison(text) {
    const normalized = this.normalizeText(text || '').toLowerCase();
    return normalized.replace(/[，。！？、,.!?]/g, '');
  }

  isDuplicate(sourceId, text, timestamp) {
    const cache = this.cache.get(sourceId) || [];
    const trimmedText = this.normalizeForComparison(text);
    const recentThreshold = timestamp - this.duplicateThreshold;
    for (const item of cache) {
      if (item.timestamp >= recentThreshold && item.text === trimmedText) {
        return true;
      }
    }
    return false;
  }

  add(sourceId, text, timestamp) {
    if (!sourceId) return;
    if (!this.cache.has(sourceId)) {
      this.cache.set(sourceId, []);
    }
    const normalized = this.normalizeForComparison(text);
    const cache = this.cache.get(sourceId);
    cache.push({ text: normalized, timestamp });
    const cutoffTime = timestamp - 10000;
    const filtered = cache.filter((item) => item.timestamp > cutoffTime);
    this.cache.set(sourceId, filtered);
  }
}

export default RecognitionCache;

