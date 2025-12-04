/**
 * 预构建入口：
 * 1) 始终准备内置 Python 运行时（funasr 依赖）
 * 2) 可选下载 Whisper GGML（仅当 ASR_IMPL=whisper 时）
 *
 * 默认 ASR_IMPL=funasr（使用 funasr streaming）。
 */

import { execSync } from 'child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

const impl = (process.env.ASR_IMPL || 'funasr').toLowerCase();

console.log(`[prebuild] ASR_IMPL=${impl}`);

// 步骤 1：准备 Python 运行时
run('npm run prepare:python');

// 步骤 2：可选下载 Whisper 模型
if (impl === 'whisper') {
  console.log('[prebuild] ASR_IMPL=whisper, downloading GGML models...');
  run('npm run download-ggml-models');
} else {
  console.log('[prebuild] ASR_IMPL!=whisper, skip GGML download (using funasr streaming by default)');
}

console.log('[prebuild] done');

