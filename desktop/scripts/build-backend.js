/**
 * Build Python backend (FastAPI + workers) via PyInstaller.
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const pythonCmd =
  process.env.PYTHON ||
  process.env.ASR_PYTHON_PATH ||
  (process.platform === 'win32' ? 'python' : 'python3');

const specPath = path.join(projectRoot, 'backend', 'pyinstaller', 'asr-backend.spec');

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot });
}

function main() {
  console.log(`[build-backend] using python: ${pythonCmd}`);
  console.log(`[build-backend] spec: ${specPath}`);
  run(`"${pythonCmd}" -m PyInstaller --clean -y "${specPath}"`);
  console.log('[build-backend] done');
}

main();

