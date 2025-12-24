import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prompts are stored as plain text templates (markdown) to make them easy to review and iterate in OSS.
// They are packaged by electron-builder because they're under `src/core/**/*` in `package.json`.
const PROMPTS_DIR = path.resolve(__dirname, '../prompts');

const PROMPT_FILES = {
  suggestion: 'suggestion.prompt.md',
  situation: 'situation.prompt.md',
  'review.with_nodes': 'review.with_nodes.prompt.md',
  'review.no_nodes': 'review.no_nodes.prompt.md'
};

const templateCache = new Map(); // id -> template string

function resolveTemplatePath(id) {
  const fileName = PROMPT_FILES[id];
  if (!fileName) {
    throw new Error(`[PromptManager] Unknown prompt id: ${id}`);
  }
  return path.join(PROMPTS_DIR, fileName);
}

function safeToString(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function getNestedValue(vars, key) {
  if (!vars || typeof vars !== 'object') return undefined;
  const parts = String(key).split('.').filter(Boolean);
  let current = vars;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function loadPromptTemplate(id) {
  if (templateCache.has(id)) {
    return templateCache.get(id);
  }
  const filePath = resolveTemplatePath(id);
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`[PromptManager] Failed to read prompt template: ${id} (${filePath}): ${error.message}`);
  }
  templateCache.set(id, text);
  return text;
}

/**
 * Very small template renderer:
 * - Replaces `{{key}}` or `{{nested.key}}` with vars[key]
 * - Missing keys become empty string by default (to keep runtime resilient)
 */
export function renderPromptTemplate(id, vars = {}, { strict = false } = {}) {
  const template = loadPromptTemplate(id);
  const missingKeys = new Set();

  const rendered = template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, key) => {
    const value = getNestedValue(vars, key);
    if (value === undefined) {
      missingKeys.add(key);
      return '';
    }
    return safeToString(value);
  });

  if (strict && missingKeys.size) {
    throw new Error(`[PromptManager] Missing template variables for ${id}: ${Array.from(missingKeys).join(', ')}`);
  }

  return rendered;
}

