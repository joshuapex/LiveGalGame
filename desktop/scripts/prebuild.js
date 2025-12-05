/**
 * 预构建入口：
 * - FunASR：准备内置 Python 运行时
 * - Faster-Whisper：无需额外处理
 */

import { execSync } from 'child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

const impl = (process.env.ASR_IMPL || 'funasr').toLowerCase();

console.log(`[prebuild] ASR_IMPL=${impl}`);

// 步骤：准备 Python 运行时（仅 FunASR 需要）
if (impl === 'funasr') {
  run('npm run prepare:python');
} else {
  console.log('[prebuild] ASR_IMPL!=funasr, skip python-env bootstrap');
}

console.log('[prebuild] done');

