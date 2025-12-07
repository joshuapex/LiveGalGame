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

/**
 * 打包单个 Python 脚本为可执行文件
 * @param {string} scriptPath - Python 脚本路径
 * @param {string} outputName - 输出名称（不含扩展名）
 * @param {string} outputDir - 输出目录
 */
function buildExecutable(scriptPath, outputName, outputDir) {
  console.log(`[build-backend] Building ${outputName} from ${scriptPath}`);
  
  const baseArgs = [
    `"${pythonCmd}"`,
    '-m PyInstaller',
    '--clean',
    '-y',
    `--name ${outputName}`,
    `--distpath "${outputDir}"`,
    `--workpath "${buildDir}"`,
  ];

  // Windows 用 onefile，其他平台用 onedir
  const modeArgs = isWin ? ['--onefile', '--noconsole'] : ['--onedir'];

  const cmd = [...baseArgs, ...modeArgs, `"${scriptPath}"`].join(' ');
  run(cmd);
}

function main() {
  console.log(`[build-backend] using python: ${pythonCmd}`);
  console.log(`[build-backend] entry: ${entryFile}`);
  ensureDirs();

  // 1. 打包主入口 asr-backend（不再 add-data worker 脚本，因为 worker 会单独打包）
  console.log('[build-backend] Step 1: Building main asr-backend...');
  const mainArgs = [
    `"${pythonCmd}"`,
    '-m PyInstaller',
    '--clean',
    '-y',
    '--name asr-backend',
    `--distpath "${distDir}"`,
    `--workpath "${buildDir}"`,
  ];
  const mainModeArgs = isWin ? ['--onefile', '--noconsole'] : ['--onedir'];
  const mainCmd = [...mainArgs, ...mainModeArgs, `"${entryFile}"`].join(' ');
  run(mainCmd);

  // 2. 打包 workers 到 asr-backend 目录内
  const targetDir = path.join(distDir, 'asr-backend');
  
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 打包 funasr worker
  const funasrWorker = path.join(asrDir, 'asr_funasr_worker.py');
  if (fs.existsSync(funasrWorker)) {
    console.log('[build-backend] Step 2: Building asr-funasr-worker...');
    buildExecutable(funasrWorker, 'asr-funasr-worker', targetDir);
  }

  // 打包 faster-whisper worker
  const fasterWhisperWorker = path.join(asrDir, 'asr_faster_whisper_worker.py');
  if (fs.existsSync(fasterWhisperWorker)) {
    console.log('[build-backend] Step 3: Building asr-faster-whisper-worker...');
    buildExecutable(fasterWhisperWorker, 'asr-faster-whisper-worker', targetDir);
  }

  // Windows: 将 main onefile exe 移动到 dist/asr-backend 下
  if (isWin) {
    const exeSrc = path.join(distDir, 'asr-backend.exe');
    const exeDst = path.join(targetDir, 'asr-backend.exe');

    if (fs.existsSync(exeSrc) && exeSrc !== exeDst) {
      fs.renameSync(exeSrc, exeDst);
      console.log(`[build-backend] moved main exe -> ${exeDst}`);
    }
  }

  console.log('[build-backend] Listing final artifacts:');
  if (fs.existsSync(targetDir)) {
    const files = fs.readdirSync(targetDir);
    files.forEach((f) => console.log(`  - ${f}`));
  }

  console.log('[build-backend] done');
}

main();

