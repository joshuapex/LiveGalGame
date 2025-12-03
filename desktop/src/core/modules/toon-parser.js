const HEADER_REGEX = /^suggestions\[(\d+)\]\{([^}]+)\}:\s*$/i;

const STRING_QUOTES = /^["']|["']$/g;

const DEFAULT_FIELDS = ['title', 'content', 'tags', 'affinity_hint'];

const normalizeValue = (value = '') => value.replace(STRING_QUOTES, '').trim();

const parseTags = (raw) => {
  if (!raw) return [];
  const cleaned = normalizeValue(raw);
  if (!cleaned) return [];
  return cleaned
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const csvSplit = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current !== '' || line.endsWith(',')) {
    result.push(current);
  }
  return result;
};

export class ToonSuggestionStreamParser {
  constructor({ onHeader, onSuggestion, onError } = {}) {
    this.onHeader = onHeader;
    this.onSuggestion = onSuggestion;
    this.onError = onError;
    this.buffer = '';
    this.headerParsed = false;
    this.expectedCount = null;
    this.fields = DEFAULT_FIELDS;
  }

  push(chunk) {
    if (!chunk) {
      console.log('[ToonSuggestionStreamParser] Received empty chunk, skipping');
      return;
    }

    console.log(`[ToonSuggestionStreamParser] Received chunk (${chunk.length} chars): "${chunk.replace(/\n/g, '\\n')}"`);
    this.buffer += chunk;
    console.log(`[ToonSuggestionStreamParser] Buffer length: ${this.buffer.length}`);

    let newlineIndex = this.buffer.indexOf('\n');
    let lineCount = 0;
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      console.log(`[ToonSuggestionStreamParser] Processing line ${++lineCount}: "${line}"`);
      this.processLine(line);
      newlineIndex = this.buffer.indexOf('\n');
    }
    console.log(`[ToonSuggestionStreamParser] Remaining buffer (${this.buffer.length} chars): "${this.buffer}"`);
  }

  end() {
    console.log('[ToonSuggestionStreamParser] Stream ended, processing remaining buffer');
    const remaining = this.buffer.trim();
    if (remaining) {
      console.log(`[ToonSuggestionStreamParser] Processing remaining line: "${remaining}"`);
      this.processLine(remaining);
    } else {
      console.log('[ToonSuggestionStreamParser] No remaining content in buffer');
    }
    this.buffer = '';
    console.log('[ToonSuggestionStreamParser] Parser finished');
  }

  processLine(line) {
    if (!line) {
      console.log('[ToonSuggestionStreamParser] Skipping empty line');
      return;
    }
    if (!this.headerParsed) {
      console.log('[ToonSuggestionStreamParser] Header not parsed yet, parsing header');
      this.parseHeader(line);
      return;
    }
    console.log('[ToonSuggestionStreamParser] Parsing data row');
    this.parseRow(line);
  }

  parseHeader(line) {
    console.log(`[ToonSuggestionStreamParser] Attempting to parse header: "${line}"`);
    const match = line.match(HEADER_REGEX);
    if (!match) {
      console.error(`[ToonSuggestionStreamParser] Header format invalid: "${line}"`);
      this.emitError(new Error(`TOON 表头格式不正确：${line}`));
      return;
    }

    this.headerParsed = true;
    this.expectedCount = Number(match[1]);
    console.log(`[ToonSuggestionStreamParser] Parsed expected count: ${this.expectedCount}`);

    const fieldList = match[2]
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);
    console.log(`[ToonSuggestionStreamParser] Parsed fields: [${fieldList.join(', ')}]`);

    if (fieldList.length) {
      this.fields = fieldList;
    }

    if (typeof this.onHeader === 'function') {
      console.log('[ToonSuggestionStreamParser] Calling onHeader callback');
      this.onHeader({
        expectedCount: this.expectedCount,
        fields: this.fields
      });
    } else {
      console.warn('[ToonSuggestionStreamParser] No onHeader callback provided');
    }
  }

  parseRow(line) {
    console.log(`[ToonSuggestionStreamParser] Parsing row: "${line}"`);
    const values = csvSplit(line);
    console.log(`[ToonSuggestionStreamParser] Parsed CSV values: [${values.map(v => `"${v}"`).join(', ')}]`);

    if (!values.length) {
      console.log('[ToonSuggestionStreamParser] No values parsed, skipping');
      return;
    }

    const suggestion = {};
    this.fields.forEach((field, index) => {
      suggestion[field] = values[index] !== undefined ? normalizeValue(values[index]) : '';
    });

    console.log(`[ToonSuggestionStreamParser] Mapped suggestion:`, suggestion);

    const normalized = {
      title: suggestion.title || `选项`,
      content: suggestion.content || '',
      tags: parseTags(suggestion.tags || suggestion.tag_list || ''),
      affinity_hint: suggestion.affinity_hint || suggestion.affinity || null
    };

    console.log(`[ToonSuggestionStreamParser] Normalized suggestion:`, normalized);

    if (typeof this.onSuggestion === 'function') {
      console.log('[ToonSuggestionStreamParser] Calling onSuggestion callback');
      this.onSuggestion(normalized);
    } else {
      console.warn('[ToonSuggestionStreamParser] No onSuggestion callback provided');
    }
  }

  emitError(error) {
    if (typeof this.onError === 'function') {
      this.onError(error);
    } else {
      console.warn('[ToonSuggestionStreamParser]', error);
    }
  }
}

export const createToonSuggestionStreamParser = (options) =>
  new ToonSuggestionStreamParser(options);

