/**
 * 数值验证工具函数
 */

/**
 * 将值强制转换为数字，如果无效则返回默认值
 * @param {*} value - 要转换的值
 * @param {number} fallback - 默认值
 * @returns {number}
 */
export const coerceNumberValue = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * 验证非空字符串
 * @param {string} str - 要验证的字符串
 * @returns {boolean}
 */
export const isNonEmptyString = (str) => {
  return typeof str === 'string' && str.trim().length > 0;
};

/**
 * 验证API密钥格式
 * @param {string} apiKey - API密钥
 * @returns {boolean}
 */
export const isValidApiKey = (apiKey) => {
  return isNonEmptyString(apiKey) && apiKey.length > 10;
};

/**
 * 验证Base URL格式
 * @param {string} url - Base URL
 * @returns {boolean}
 */
export const isValidBaseUrl = (url) => {
  if (!url) return true; // 可选字段
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * 验证模型名称
 * @param {string} modelName - 模型名称
 * @returns {boolean}
 */
export const isValidModelName = (modelName) => {
  return isNonEmptyString(modelName) && modelName.trim().length > 0;
};

/**
 * 验证超时时间（毫秒）
 * @param {number|string|null|undefined} value - 超时时间
 * @returns {boolean}
 */
export const isValidTimeoutMs = (value) => {
  if (value === '' || value === null || value === undefined) return true;
  const num = Number(value);
  return Number.isFinite(num) && num > 0;
};
