import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const logDir = path.resolve(projectRoot, '..', 'logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `dev-${timestamp}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' });

console.log(`[DevLog] Logging to: ${logFile}`);

// 强制设置环境变量
const env = { 
    ...process.env, 
    PYTHONIOENCODING: 'utf-8',
    NODE_ENV: 'development'
};

const child = spawn('pnpm', ['dev'], {
    cwd: projectRoot,
    shell: true,
    env
});

child.stdout.on('data', (data) => {
    process.stdout.write(data);
    logStream.write(data);
});

child.stderr.on('data', (data) => {
    process.stderr.write(data);
    logStream.write(data);
});

child.on('close', (code) => {
    console.log(`[DevLog] Process exited with code ${code}`);
    logStream.end();
});










