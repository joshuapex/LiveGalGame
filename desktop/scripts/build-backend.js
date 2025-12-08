/**
 * Build Python backend (FastAPI + workers) via PyInstaller.
 * - 打包 main.py 为主入口 (asr-backend)
 * - 同时打包每个 worker 为独立可执行文件 (asr-funasr-worker, asr-faster-whisper-worker)
 * - Windows: onefile exe
 * - macOS/Linux: onedir
 */
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function resolvePython() {
  // 优先显式传入的 ASR_PYTHON_PATH（CI 已指向 python-env）
  if (process.env.ASR_PYTHON_PATH) {
    return process.env.ASR_PYTHON_PATH;
  }
  if (process.env.PYTHON) {
    return process.env.PYTHON;
  }
  // 尝试使用项目内的 python-env
  const venvPy = process.platform === 'win32'
    ? path.join(projectRoot, 'python-env', 'Scripts', 'python.exe')
    : path.join(projectRoot, 'python-env', 'bin', 'python3');
  if (fs.existsSync(venvPy)) {
    return venvPy;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

const pythonCmd = resolvePython();

const backendDir = path.join(projectRoot, 'backend');
const asrDir = path.join(backendDir, 'asr');
const distDir = path.join(backendDir, 'dist');
const buildDir = path.join(backendDir, 'build');
const entryFile = path.join(backendDir, 'main.py');
const isWin = process.platform === 'win32';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot });
}

function ensureDirs() {
  [backendDir, distDir, buildDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

function main() {
  console.log(`[build-backend] using python: ${pythonCmd}`);
  console.log(`[build-backend] entry: ${entryFile}`);
  ensureDirs();

  // 单入口打包：仅打包 main.py，强制使用 onedir（避免 onefile 重复解包体积）
  console.log('[build-backend] Step 1: Building asr-backend (single onedir) ...');

  const dataSep = isWin ? ';' : ':'; // PyInstaller add-data 分隔符
  const mainArgs = [
    `"${pythonCmd}"`,
    '-m PyInstaller',
    '--clean',
    '-y',
    '--name asr-backend',
    `--distpath "${distDir}"`,
    `--workpath "${buildDir}"`,
    // 打包 asr 目录，便于运行时子进程直接调用 python 脚本（不再构建独立 worker 可执行文件）
    `--add-data "${asrDir}${dataSep}asr"`,
    // 隐式依赖收集：确保 funasr / faster_whisper / torch 等在主包中一次性收集
    '--collect-submodules funasr',
    '--collect-submodules faster_whisper',
    '--collect-submodules torch',
    '--collect-submodules ctranslate2',
    '--collect-submodules tokenizers',
    '--collect-submodules sentencepiece',
    '--hidden-import funasr',
    '--hidden-import faster_whisper',
    '--hidden-import torch',
  ];

  // 统一使用 onedir，避免 onefile 的压缩/解压开销
  const mainModeArgs = ['--onedir'];
  const mainCmd = [...mainArgs, ...mainModeArgs, `"${entryFile}"`].join(' ');
  console.log(`[build-backend] PyInstaller cmd: ${mainCmd}`);
  run(mainCmd);

  // 输出列表
  console.log('[build-backend] Listing final artifacts:');
  const targetDir = path.join(distDir, 'asr-backend');
  if (fs.existsSync(targetDir)) {
    const files = fs.readdirSync(targetDir);
    files.forEach((f) => console.log(`  - ${f}`));
  } else {
    console.warn(`[build-backend] targetDir not found: ${targetDir}`);
  }

  console.log('[build-backend] done');
}

main();

