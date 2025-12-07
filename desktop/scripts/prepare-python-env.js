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
const bootstrapDir = path.join(projectRoot, 'python-bootstrap');
const miniforgePrefix = path.join(bootstrapDir, 'miniforge');
const requirementsPath = path.join(projectRoot, 'requirements.txt');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const desiredPy = process.env.PYTHON_VERSION || '3.10';
const candidateCmds = [
  process.env.PYTHON,                          // 用户显式指定
  isWin ? `py -${desiredPy}` : null,           // Windows 推荐 py 启动器
  isWin ? `python${desiredPy}` : `python${desiredPy}`, // python3.10
  isWin ? `python${desiredPy.replace('.', '')}` : null, // 兼容 python310
  isWin ? 'python3' : 'python3',
  isWin ? 'python' : 'python',
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
      if (major === 3 && minor >= 8 && minor <= 12) {
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
      `[prepare-python-env] 找不到可用的 Python，请安装 3.10~3.12 并设置环境变量 PYTHON 指向该解释器（当前尝试: ${candidateCmds.join(', ')})`
    );
  }

  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const installer = `Miniforge3-MacOSX-${arch}.sh`;
  const url = `https://github.com/conda-forge/miniforge/releases/latest/download/${installer}`;

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

  // 解除 macOS 安全属性，避免 “Operation not permitted”
  try {
    run(`xattr -d com.apple.quarantine "${installerPath}"`, { stdio: 'ignore' });
  } catch {
    // ignore
  }

  if (!fs.existsSync(path.join(miniforgePrefix, 'bin', 'python'))) {
    console.log('[prepare-python-env] installing Miniforge (py310)...');
    run(`bash "${installerPath}" -b -p "${miniforgePrefix}"`);
  } else {
    console.log('[prepare-python-env] Miniforge already installed');
  }

  const bundledPy = path.join(miniforgePrefix, 'bin', 'python3');
  console.log(`[prepare-python-env] using bootstrapped python: ${bundledPy}`);
  return bundledPy;
}

function ensureCondaEnv(miniforgePython, { forceRebuild = false } = {}) {
  const condaBin = isWin
    ? path.join(miniforgePrefix, 'Scripts', 'conda.exe')
    : path.join(miniforgePrefix, 'bin', 'conda');

  if (!fs.existsSync(condaBin)) {
    throw new Error(`[prepare-python-env] conda not found at ${condaBin}, bootstrap Miniforge first`);
  }

  if (fs.existsSync(venvDir) && forceRebuild) {
    console.log(`[prepare-python-env] removing existing env for rebuild: ${venvDir}`);
    fs.rmSync(venvDir, { recursive: true, force: true });
  }

  if (fs.existsSync(pythonPath)) {
    console.log(`[prepare-python-env] env already exists: ${pythonPath}`);
    return;
  }

  console.log(`[prepare-python-env] creating conda env (Python ${desiredPy}) at ${venvDir}`);
  run(`"${condaBin}" create -y -p "${venvDir}" python=${desiredPy} pip`);
}

function ensureVenv(pythonCmd, { forceRebuild = false } = {}) {
  if (fs.existsSync(venvDir) && forceRebuild) {
    console.log(`[prepare-python-env] removing existing venv for rebuild: ${venvDir}`);
    fs.rmSync(venvDir, { recursive: true, force: true });
  }

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
  run(`"${pythonPath}" -m pip install --upgrade pip`, { env: envNoProxy });

  // Windows 路径：不安装 funasr，避免 av 编译；仅装 faster-whisper 链条
  if (isWin) {
    console.log('[prepare-python-env] install Windows subset (skip funasr)');
    const winPkgs = [
      'torch==2.2.2',
      'torchaudio==2.2.2',
      'faster-whisper==0.10.0',
      'soundfile>=0.12.1',
      'numpy<2',
      'requests[socks]>=2.31.0',
      'fastapi>=0.115.0',
      'uvicorn[standard]>=0.30.0',
      'websockets>=12.0',
      'python-multipart>=0.0.9',
    ];
    // 与 requirements 同步，使用 PyTorch CPU 源，避免拉不到轮子
    const torchIndex = 'https://download.pytorch.org/whl/cpu';
    run(
      `"${pythonPath}" -m pip install --no-cache-dir --extra-index-url ${torchIndex} ${winPkgs.join(' ')}`,
      { env: envNoProxy }
    );
    return;
  }

  // mac / linux 按完整 requirements 安装（包含 funasr）
  console.log(`[prepare-python-env] install requirements`);
  run(`"${pythonPath}" -m pip install -r "${requirementsPath}"`, { env: envNoProxy });
}

function ensureCondaPackInstalled(miniforgePython) {
  console.log('[prepare-python-env] ensure conda-pack is installed in base');
  run(`"${miniforgePython}" -m pip install --upgrade conda-pack`);
}

function installCondaPackages(packages) {
  const mambaBin = path.join(miniforgePrefix, isWin ? 'Scripts' : 'bin', isWin ? 'mamba.exe' : 'mamba');
  const condaBin = path.join(miniforgePrefix, isWin ? 'Scripts' : 'bin', isWin ? 'conda.exe' : 'conda');
  const installer = fs.existsSync(mambaBin) ? mambaBin : condaBin;
  if (!fs.existsSync(installer)) {
    throw new Error('[prepare-python-env] neither mamba nor conda found');
  }
  const pkgList = packages.join(' ');
  console.log(`[prepare-python-env] conda installing packages: ${pkgList}`);
  run(`"${installer}" install -y -p "${venvDir}" -c conda-forge ${pkgList}`);
}

function packCondaEnv() {
  const tarPath = `${venvDir}.tar.gz`;
  console.log(`[prepare-python-env] packing env with conda-pack -> ${tarPath}`);
  run(`"${miniforgePrefix}/bin/conda-pack" -p "${venvDir}" -o "${tarPath}" -f`);

  console.log(`[prepare-python-env] repacking env to make it relocatable`);
  fs.rmSync(venvDir, { recursive: true, force: true });
  fs.mkdirSync(venvDir, { recursive: true });
  run(`tar -xzf "${tarPath}" -C "${venvDir}"`);
  run(`"${path.join(venvDir, 'bin', 'conda-unpack')}"`);
  fs.rmSync(tarPath, { force: true });
}

/**
 * 修复 venv 中的 Python 符号链接为实际文件副本
 * venv 创建的符号链接是绝对路径，打包后在其他机器上会失效
 */
function fixPythonSymlinks() {
  const binDir = path.join(venvDir, isWin ? 'Scripts' : 'bin');
  const pythonLinks = isWin
    ? ['python.exe', 'python3.exe']
    : ['python', 'python3', `python${desiredPy}`];

  for (const linkName of pythonLinks) {
    const linkPath = path.join(binDir, linkName);
    if (!fs.existsSync(linkPath)) {
      continue;
    }

    try {
      const stat = fs.lstatSync(linkPath);
      if (!stat.isSymbolicLink()) {
        continue; // 已经是实际文件，跳过
      }

      const target = fs.readlinkSync(linkPath);
      // 检查是否是绝对路径的符号链接
      if (path.isAbsolute(target) && fs.existsSync(target)) {
        console.log(`[prepare-python-env] fixing symlink: ${linkName} -> ${target}`);
        // 删除符号链接，复制实际文件
        fs.unlinkSync(linkPath);
        fs.copyFileSync(target, linkPath);
        // 确保可执行权限
        if (!isWin) {
          fs.chmodSync(linkPath, 0o755);
        }
        console.log(`[prepare-python-env] replaced symlink with actual file: ${linkName}`);
      }
    } catch (err) {
      console.warn(`[prepare-python-env] warning: failed to fix ${linkName}:`, err.message);
    }
  }
}

function main() {
  // CI 场景强制使用 Miniforge，避免使用系统 Framework Python 导致打包后动态链接失效
  const forceMiniforge = isMac && process.env.CI === 'true';
  const forceRebuild = forceMiniforge || process.env.FORCE_REBUILD_VENV === 'true';

  let pythonCmd = forceMiniforge ? null : detectPython();

  // 如果检测到的 python 是 macOS Framework 路径，也切换到 Miniforge
  const isMacFrameworkPython = pythonCmd && isMac &&
    pythonCmd.includes('/Library/Frameworks/Python.framework');

  if (!pythonCmd || forceMiniforge || isMacFrameworkPython) {
    pythonCmd = bootstrapMiniforge();
  }

  if (isMac) {
    ensureCondaEnv(pythonCmd, { forceRebuild });
    ensureCondaPackInstalled(pythonCmd);
    installCondaPackages([
      'ffmpeg',
      'av=11.*',
    ]);
    installDeps();
    packCondaEnv();
    fixPythonSymlinks();
  } else {
    ensureVenv(pythonCmd, { forceRebuild });
    installDeps();
    fixPythonSymlinks();
  }
  console.log('[prepare-python-env] done');
}

main();

