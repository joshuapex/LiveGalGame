/**
 * 准备内置 Python 运行环境，供打包后使用。
 * - 创建 venv: desktop/python-env
 * - 安装 requirements.txt 中的依赖（包含 funasr、torch CPU 等）
 *
 * 设计目标：
 * 1. 打包时将 python-env 放入 extraResources，客户端无需自行安装 Python。
 * 2. 跨平台（macOS/Windows）调用 pip，避免依赖激活脚本。
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const venvDir = path.join(projectRoot, 'python-env');
const requirementsPath = path.join(projectRoot, 'requirements.txt');

const isWin = process.platform === 'win32';
const desiredPy = process.env.PYTHON_VERSION || '3.10';
const candidateCmds = [
  process.env.PYTHON,
  isWin ? `python${desiredPy.replace(/^3\./, '')}` : `python${desiredPy}`,
  isWin ? 'python' : 'python3',
].filter(Boolean);

const pythonPath = isWin
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python3');
const pipPath = isWin
  ? path.join(venvDir, 'Scripts', 'pip.exe')
  : path.join(venvDir, 'bin', 'pip');

function run(cmd, options = {}) {
  execSync(cmd, { stdio: 'inherit', ...options });
}

function detectPython() {
  for (const cmd of candidateCmds) {
    try {
      const v = execSync(`"${cmd}" -c "import sys;print(sys.version)"`, { encoding: 'utf-8' }).trim();
      const [major, minor] = v.split('.')[0] ? v.split('.').map((n) => parseInt(n, 10)) : [0, 0];
      if (major === 3 && minor >= 8 && minor <= 13) {
        console.log(`[prepare-python-env] using python: ${cmd} (version ${major}.${minor})`);
        return cmd;
      }
      console.warn(`[prepare-python-env] skip ${cmd}, unsupported version ${v}`);
    } catch {
      // ignore and try next
    }
  }
  return null;
}

function bootstrapMiniforge() {
  if (process.platform !== 'darwin') {
    throw new Error(
      `[prepare-python-env] 找不到可用的 Python，请安装 3.10~3.13 并设置环境变量 PYTHON 指向该解释器（当前尝试: ${candidateCmds.join(', ')})`
    );
  }

  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const installer = `Miniforge3-MacOSX-${arch}.sh`;
  const url = `https://github.com/conda-forge/miniforge/releases/latest/download/${installer}`;
  const bootstrapDir = path.join(projectRoot, 'python-bootstrap');

  if (!fs.existsSync(bootstrapDir)) {
    fs.mkdirSync(bootstrapDir, { recursive: true });
  }

  const installerPath = path.join(bootstrapDir, installer);
  if (!fs.existsSync(installerPath)) {
    console.log(`[prepare-python-env] downloading Miniforge (${arch}) ...`);
    try {
      run(`curl -L --retry 3 --retry-all-errors --http1.1 "${url}" -o "${installerPath}"`);
    } catch (err) {
      // 清理损坏的下载，避免下次误判
      if (fs.existsSync(installerPath)) {
        fs.unlinkSync(installerPath);
      }
      throw err;
    }
    run(`chmod +x "${installerPath}"`);
  } else {
    console.log('[prepare-python-env] Miniforge installer already downloaded');
  }

  const prefix = path.join(bootstrapDir, 'miniforge');
  if (!fs.existsSync(path.join(prefix, 'bin', 'python'))) {
    console.log('[prepare-python-env] installing Miniforge (py310)...');
    run(`"${installerPath}" -b -p "${prefix}"`);
  } else {
    console.log('[prepare-python-env] Miniforge already installed');
  }

  const bundledPy = path.join(prefix, 'bin', 'python3');
  console.log(`[prepare-python-env] using bootstrapped python: ${bundledPy}`);
  return bundledPy;
}

function ensureVenv(pythonCmd) {
  if (fs.existsSync(pythonPath)) {
    console.log(`[prepare-python-env] venv already exists: ${pythonPath}`);
    return;
  }
  console.log(`[prepare-python-env] creating venv via ${pythonCmd} -m venv "${venvDir}"`);
  run(`"${pythonCmd}" -m venv "${venvDir}"`);
}

function installDeps() {
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`requirements.txt not found at ${requirementsPath}`);
  }
  // 为 pip 安装禁用代理，避免 socks 依赖错误
  const envNoProxy = {
    ...process.env,
    ALL_PROXY: undefined,
    all_proxy: undefined,
    HTTP_PROXY: undefined,
    http_proxy: undefined,
    HTTPS_PROXY: undefined,
    https_proxy: undefined,
    PIP_NO_PROXY: '*',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  };

  console.log(`[prepare-python-env] upgrade pip`);
  run(`"${pipPath}" install --upgrade pip`, { env: envNoProxy });

  console.log(`[prepare-python-env] install requirements`);
  run(`"${pipPath}" install -r "${requirementsPath}"`, { env: envNoProxy });
}

function main() {
  let pythonCmd = detectPython();
  if (!pythonCmd) {
    pythonCmd = bootstrapMiniforge();
  }
  ensureVenv(pythonCmd);
  installDeps();
  console.log('[prepare-python-env] done');
}

main();

