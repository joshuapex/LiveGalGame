/**
 * WhisperService 工厂
 * 根据配置选择使用哪个实现：
 * - whisper-service.js: 使用 @xenova/transformers
 * - whisper-service-cli.js: 使用 whisper CLI（更小更快）
 */

import WhisperServiceCLI from './whisper-service-cli.js';
import WhisperServiceTransformers from './whisper-service.js';
import * as logger from '../utils/logger.js';

// 默认使用的实现（cpp = whisper-cli, transformers = transformers.js）
const DEFAULT_IMPLEMENTATION = process.env.WHISPER_IMPL || 'cpp';

/**
 * 创建 Whisper 服务实例
 */
export async function createWhisperService() {
  const implementation = DEFAULT_IMPLEMENTATION;

  logger.log(`尝试加载 ${implementation} 实现...`);

  if (implementation === 'cpp') {
    try {
      const service = new WhisperServiceCLI();
      logger.log('使用 whisper-cli 实现');
      return service;
    } catch (error) {
      logger.warn('whisper-cli 实现加载失败，回退到 transformers.js:', error.message);
      const service = new WhisperServiceTransformers();
      logger.log('回退到 transformers.js 实现');
      return service;
    }
  } else {
    const service = new WhisperServiceTransformers();
    logger.log('使用 transformers.js 实现');
    return service;
  }
}

export default createWhisperService;

