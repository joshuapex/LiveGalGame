/**
 * 预构建入口：
 * - 构建 Python FastAPI 后端（PyInstaller onedir）
 */

import { execSync } from 'child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

console.log('[prebuild] building backend (PyInstaller) ...');
run('npm run build:backend');
console.log('[prebuild] done');

