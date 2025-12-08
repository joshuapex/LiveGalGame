import { app, BrowserWindow } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { ASR_MODEL_PRESETS, getAsrModelPreset } from '../shared/asr-models.js';

const DOWNLOAD_SCRIPT = path.join(app.getAppPath(), 'scripts', 'download_asr_model.py');

function safeReaddir(targetPath) {
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function directorySize(targetPath) {
  let total = 0;
  const stack = [targetPath];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (stat.isFile()) {
          total += stat.size;
        }
      } catch {
        // Ignore files or links that disappear mid-scan
      }
    }
  }
  return total;
}

function getModelScopeRepoPath(cacheDir, repoId) {
  if (!repoId || !cacheDir) {
    return null;
  }
  const repoSegments = repoId.split(/[\\/]/).filter(Boolean);
  if (repoSegments.length === 0) {
    return null;
  }
  const baseCandidates = [
    cacheDir,
    path.join(cacheDir, 'models'),
    path.join(cacheDir, 'hub'),
    path.join(cacheDir, 'hub', 'models'),
    path.join(cacheDir, 'modelscope'),
    path.join(cacheDir, 'modelscope', 'hub'),
    path.join(cacheDir, 'modelscope', 'hub', 'models'),
  ];
  const uniqueBases = [...new Set(baseCandidates)];
  for (const basePath of uniqueBases) {
    try {
      if (!fs.existsSync(basePath)) {
        continue;
      }
    } catch {
      continue;
    }
    const candidate = path.join(basePath, ...repoSegments);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export default class ASRModelManager extends EventEmitter {
  constructor() {
    super();
    // 应用级缓存根目录（可通过环境变量覆盖）
    this.appCacheBase = process.env.ASR_CACHE_BASE || path.join(app.getPath('userData'), 'asr-cache');
    this.hfHome = process.env.HF_HOME || path.join(this.appCacheBase, 'hf-home');
    this.msCache = process.env.MODELSCOPE_CACHE || path.join(this.appCacheBase, 'modelscope', 'hub');

    // Primary cache directory (共享给 HF 默认 hub)
    this.cacheDir = process.env.ASR_CACHE_DIR || path.join(this.hfHome, 'hub');
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.mkdirSync(this.hfHome, { recursive: true });
      fs.mkdirSync(this.msCache, { recursive: true });
    } catch {
      // ignore mkdir errors
    }

    // Also check system default HuggingFace cache (where faster-whisper actually downloads models)
    this.systemHfCache = path.join(os.homedir(), '.cache', 'huggingface', 'hub');
    // And system default ModelScope cache
    this.systemMsCache = path.join(os.homedir(), '.cache', 'modelscope', 'hub');

    // List of cache directories to check (in priority order)
    this.cacheDirs = [
      this.cacheDir,           // App-configured cache
      this.msCache,            // App ModelScope cache
      this.systemHfCache,      // System default HF cache
      this.systemMsCache       // System default ModelScope cache
    ].filter(dir => {
      try {
        return fs.existsSync(dir);
      } catch {
        return false;
      }
    });

    this.pythonPath = this.detectPythonPath();
    this.activeDownloads = new Map(); // modelId -> download context
  }

  detectPythonPath() {
    const envPython = process.env.ASR_PYTHON_PATH;
    if (envPython && fs.existsSync(envPython)) {
      return envPython;
    }
    const resourcesPath = process.resourcesPath;
    const projectRoot = app.isPackaged
      ? path.join(resourcesPath || app.getAppPath(), '..')
      : app.getAppPath();

    // 优先使用打包内置的 python-env（extraResources）
    const bundledPython = process.platform === 'win32'
      ? path.join(resourcesPath || '', 'python-env', 'Scripts', 'python.exe')
      : path.join(resourcesPath || '', 'python-env', 'bin', 'python3');

    // 开发/调试：使用仓库下的 python-env/.venv
    const repoPythonEnv = process.platform === 'win32'
      ? path.join(projectRoot, 'python-env', 'Scripts', 'python.exe')
      : path.join(projectRoot, 'python-env', 'bin', 'python3');

    const candidates = [
      bundledPython,
      repoPythonEnv,
      path.join(projectRoot, '.venv', 'bin', 'python'),
      path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
      'python3',
      'python',
    ];
    for (const candidate of candidates) {
      try {
        if (candidate.includes(path.sep) && fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }
    return 'python3';
  }

  getModelPresets() {
    return ASR_MODEL_PRESETS;
  }

  findSnapshotDir(preset) {
    // Try all cache directories
    console.log(`[ASR ModelManager] Searching for model ${preset.id} in dirs:`, this.cacheDirs);
    for (const cacheDir of this.cacheDirs) {
      const repoSafe = `models--${preset.repoId.replace('/', '--')}`;
      const repoRoot = path.join(cacheDir, repoSafe);
      console.log(`[ASR ModelManager] Checking HF path: ${repoRoot}`);

      if (!fs.existsSync(repoRoot)) {
        console.log(`[ASR ModelManager] Path does not exist: ${repoRoot}`);
        // 如果没在 HF 目录里找到，尝试 ModelScope 直接目录
        if (preset.modelScopeRepoId) {
          const msPath = getModelScopeRepoPath(cacheDir, preset.modelScopeRepoId);
          if (msPath) {
            console.log(`[ASR ModelManager] Found ModelScope path: ${msPath}`);
            return msPath;
          }
        }
        continue;
      }

      const refsDir = path.join(repoRoot, 'refs');
      let snapshotSha = null;
      const preferredRefs = ['main', 'default', 'refs/head/main'];
      for (const refName of preferredRefs) {
        const refPath = path.join(refsDir, refName);
        if (fs.existsSync(refPath)) {
          try {
            snapshotSha = fs.readFileSync(refPath, 'utf-8').trim();
            if (snapshotSha) {
              console.log(`[ASR ModelManager] Found SHA from ref ${refName}: ${snapshotSha}`);
              break;
            }
          } catch {
            // ignore
          }
        }
      }

      const snapshotsDir = path.join(repoRoot, 'snapshots');
      if (!snapshotSha) {
        console.log(`[ASR ModelManager] No SHA from refs, checking snapshots dir: ${snapshotsDir}`);
        try {
          if (fs.existsSync(snapshotsDir)) {
            const snapshots = safeReaddir(snapshotsDir).filter((entry) => entry.isDirectory());
            snapshots.sort((a, b) => {
              try {
                const aStat = fs.statSync(path.join(snapshotsDir, a.name));
                const bStat = fs.statSync(path.join(snapshotsDir, b.name));
                return bStat.mtimeMs - aStat.mtimeMs;
              } catch {
                return 0;
              }
            });
            snapshotSha = snapshots.length > 0 ? snapshots[0].name : null;
            console.log(`[ASR ModelManager] Found latest snapshot from dir listing: ${snapshotSha}`);
          }
        } catch (e) {
          console.error(`[ASR ModelManager] Error listing snapshots: ${e.message}`);
        }
      }

      if (!snapshotSha) {
        continue;
      }

      const snapshotPath = path.join(snapshotsDir, snapshotSha);
      if (fs.existsSync(snapshotPath)) {
        console.log(`[ASR ModelManager] Found valid snapshot path: ${snapshotPath}`);
        return snapshotPath;
      } else {
        console.log(`[ASR ModelManager] Snapshot path does not exist: ${snapshotPath}`);
      }
    }
    return null;
  }

  getModelStatus(modelId) {
    const preset = getAsrModelPreset(modelId);
    if (!preset) {
      return null;
    }

    // Check HuggingFace cache
    const hfSnapshotPath = this.findSnapshotDir(preset);
    let hfDownloadedBytes = 0;
    let hfUpdatedAt = null;
    if (hfSnapshotPath) {
      hfDownloadedBytes = directorySize(hfSnapshotPath);
      try {
        const stat = fs.statSync(hfSnapshotPath);
        hfUpdatedAt = stat.mtimeMs;
      } catch {
        hfUpdatedAt = null;
      }
    }

    // Check ModelScope cache
    // ModelScope structure: cacheDir / repoId (e.g. gpustack/faster-whisper-medium)
    // or sometimes cacheDir / repoId / .mv / ...
    // Simple check: cacheDir / repoId
    let msSnapshotPath = null;
    let msDownloadedBytes = 0;
    let msUpdatedAt = null;

    if (preset.modelScopeRepoId) {
      // Try all cache directories for ModelScope models
      for (const cacheDir of this.cacheDirs) {
        const msRepoPath = getModelScopeRepoPath(cacheDir, preset.modelScopeRepoId);
        if (!msRepoPath) {
          continue;
        }
        msSnapshotPath = msRepoPath;
        msDownloadedBytes = directorySize(msSnapshotPath);
        try {
          const stat = fs.statSync(msSnapshotPath);
          msUpdatedAt = stat.mtimeMs;
        } catch {
          msUpdatedAt = null;
        }
        break; // Found it, stop searching
      }
    }

    // Determine which one to use (prefer the one that is "more" downloaded or exists)
    const snapshotPath = hfSnapshotPath || msSnapshotPath;
    const downloadedBytes = Math.max(hfDownloadedBytes, msDownloadedBytes);
    const updatedAt = hfUpdatedAt || msUpdatedAt;
    const source = hfSnapshotPath ? 'huggingface' : (msSnapshotPath ? 'modelscope' : null);

    const targetSize = preset.sizeBytes || 0;

    // Relaxed check: if we have > 10MB and (model.bin or config.json exists), consider it downloaded
    // or if size is > 90% of target
    const hasCriticalFiles = snapshotPath && ([
      'config.json',
      'configuration.json',
      'config.yaml',
      'model.bin',
      'model.pt'
    ].some((fileName) => {
      try {
        return fs.existsSync(path.join(snapshotPath, fileName));
      } catch {
        return false;
      }
    }));

    const isDownloaded = (targetSize > 0 && downloadedBytes >= targetSize * 0.9) ||
      (hasCriticalFiles && downloadedBytes > 10 * 1024 * 1024);

    if (modelId === 'medium' || modelId === 'small') {
      console.log(`[ASR ModelManager] Status for ${modelId}:`, {
        hfSnapshotPath,
        msSnapshotPath,
        downloadedBytes,
        targetSize,
        hasCriticalFiles,
        isDownloaded,
        source
      });
    }

    return {
      modelId,
      repoId: preset.repoId,
      modelScopeRepoId: preset.modelScopeRepoId,
      sizeBytes: targetSize,
      downloadedBytes,
      isDownloaded,
      snapshotPath,
      updatedAt,
      activeDownload: this.activeDownloads.has(modelId),
      source
    };
  }

  getAllModelStatuses() {
    try {
      return ASR_MODEL_PRESETS.map((preset) => this.getModelStatus(preset.id));
    } catch (error) {
      console.error('[ASR ModelManager] Error getting all model statuses:', error);
      return [];
    }
  }

  startDownload(modelId, source = 'huggingface', allowFallback = true) {
    if (this.activeDownloads.has(modelId)) {
      return { status: 'running' };
    }
    const preset = getAsrModelPreset(modelId);
    if (!preset) {
      throw new Error(`Unknown ASR model: ${modelId}`);
    }
    const pythonExecutable = this.pythonPath;
    if (!pythonExecutable) {
      throw new Error('Python executable not found');
    }

    const repoId = source === 'modelscope' && preset.modelScopeRepoId ? preset.modelScopeRepoId : preset.repoId;

    console.log(`[ASR ModelManager] Starting download: modelId=${modelId}, source=${source}, repoId=${repoId}`);
    console.log(`[ASR ModelManager] Python path: ${pythonExecutable}`);
    console.log(`[ASR ModelManager] Download script: ${DOWNLOAD_SCRIPT}`);

    const jobs = Math.max(2, Math.min(8, Math.floor((os.cpus()?.length || 4) / 2)) || 2);
    const args = [
      DOWNLOAD_SCRIPT,
      '--model-id',
      preset.id,
      '--repo-id',
      repoId,
      '--cache-dir',
      this.cacheDir,
      '--jobs',
      String(jobs),
      '--source',
      source
    ];

    console.log(`[ASR ModelManager] Spawn command: ${pythonExecutable} ${args.join(' ')}`);

    const hfHomeEnv = this.hfHome || process.env.HF_HOME;
    const msCacheEnv = this.msCache || process.env.MODELSCOPE_CACHE;
    const env = {
      ...process.env,
      ASR_CACHE_DIR: this.cacheDir,
      HF_HOME: hfHomeEnv,
      MODELSCOPE_CACHE: msCacheEnv,
      PYTHONIOENCODING: 'utf-8',
    };
    const child = spawn(pythonExecutable, args, { env });
    const downloadCtx = {
      modelId,
      repoId: repoId,
      source,
      child,
      totalBytes: preset.sizeBytes || null,
      snapshotPath: null,
      timer: null,
      lastBytes: 0,
      lastTimestamp: Date.now(),
    };
    this.activeDownloads.set(modelId, downloadCtx);
    this.broadcast('asr-model-download-started', {
      modelId,
      repoId: repoId,
      source
    });

    console.log(`[ASR ModelManager] Download started for ${modelId}`);

    let stdoutBuffer = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      lines.forEach((line) => {
        console.log(`[ASR ModelManager][${modelId}][stdout] ${line}`);
        this.handleScriptMessage(downloadCtx, line);
      });
    });
    child.stderr.on('data', (chunk) => {
      const message = chunk.toString();
      console.error(`[ASR ModelManager][${modelId}][stderr] ${message}`);
      this.broadcast('asr-model-download-log', {
        modelId,
        repoId: repoId,
        message,
      });
    });
    const finalize = (code, signal) => {
      console.log(`[ASR ModelManager] Download process exited: modelId=${modelId}, code=${code}, signal=${signal}`);
      if (downloadCtx.timer) {
        clearInterval(downloadCtx.timer);
      }
      this.activeDownloads.delete(modelId);
      const status = this.getModelStatus(modelId);
      if (code === 0) {
        console.log(`[ASR ModelManager] Download completed successfully: ${modelId}`);
        this.broadcast('asr-model-download-complete', {
          modelId,
          repoId: repoId,
          status,
        });
      } else {
        console.error(`[ASR ModelManager] Download failed: modelId=${modelId}, code=${code}, source=${source}`);

        // 失败且具备 ModelScope 资源时自动回退一次
        if (allowFallback && source === 'huggingface' && preset.modelScopeRepoId) {
          console.warn(`[ASR ModelManager] Falling back to ModelScope for ${modelId}`);
          this.broadcast('asr-model-download-log', {
            modelId,
            repoId,
            message: 'HuggingFace 下载失败，尝试使用 ModelScope 源...'
          });
          return this.startDownload(modelId, 'modelscope', false);
        }

        this.broadcast('asr-model-download-error', {
          modelId,
          repoId: repoId,
          code,
          signal,
        });
      }
    };
    child.on('close', (code, signal) => finalize(code, signal));
    child.on('error', (error) => {
      console.error(`[ASR ModelManager] Download process error: ${error.message}`);
      this.broadcast('asr-model-download-error', {
        modelId,
        repoId: repoId,
        message: error.message,
      });
      finalize(1, null);
    });
    return { status: 'started' };
  }

  handleScriptMessage(ctx, line) {
    if (!line.trim()) return;
    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      this.broadcast('asr-model-download-log', {
        modelId: ctx.modelId,
        repoId: ctx.repoId,
        message: line,
      });
      return;
    }
    if (payload.event === 'manifest') {
      if (payload.totalBytes) {
        ctx.totalBytes = payload.totalBytes;
      }
      if (payload.snapshotRelativePath) {
        ctx.snapshotPath = path.isAbsolute(payload.snapshotRelativePath)
          ? payload.snapshotRelativePath
          : path.join(this.cacheDir, payload.snapshotRelativePath);

        // ModelScope 下载的落盘路径可能与 cacheDir 结构不同，尝试解析实际目录
        if (payload.source === 'modelscope') {
          const resolvedMsPath =
            getModelScopeRepoPath(this.cacheDir, ctx.repoId) ||
            getModelScopeRepoPath(this.msCache, ctx.repoId) ||
            getModelScopeRepoPath(this.systemMsCache, ctx.repoId) ||
            getModelScopeRepoPath(this.systemHfCache, ctx.repoId);
          if (resolvedMsPath) {
            ctx.snapshotPath = resolvedMsPath;
          }
        }
      }
      if (!ctx.timer) {
        ctx.timer = setInterval(() => this.emitProgress(ctx), 1000);
      }
    } else if (payload.event === 'completed') {
      if (payload.localDir) {
        ctx.snapshotPath = payload.localDir;
      }
      this.emitProgress(ctx, true);
    } else if (payload.event === 'error') {
      this.broadcast('asr-model-download-error', {
        modelId: ctx.modelId,
        repoId: ctx.repoId,
        message: payload.message,
      });
    } else if (payload.event === 'cancelled') {
      this.broadcast('asr-model-download-cancelled', {
        modelId: ctx.modelId,
        repoId: ctx.repoId,
      });
    }
  }

  emitProgress(ctx, force = false) {
    if (!ctx.snapshotPath) {
      return;
    }
    const downloadedBytes = directorySize(ctx.snapshotPath);
    const totalBytes = ctx.totalBytes || downloadedBytes;
    const now = Date.now();
    const elapsedMs = now - (ctx.lastTimestamp || now);
    const deltaBytes = downloadedBytes - (ctx.lastBytes || 0);
    const bytesPerSecond = elapsedMs > 0 ? (deltaBytes / (elapsedMs / 1000)) : 0;
    ctx.lastBytes = downloadedBytes;
    ctx.lastTimestamp = now;
    this.broadcast('asr-model-download-progress', {
      modelId: ctx.modelId,
      repoId: ctx.repoId,
      downloadedBytes,
      totalBytes,
      bytesPerSecond,
    });
    if (force && ctx.timer) {
      clearInterval(ctx.timer);
      ctx.timer = null;
    }
  }

  cancelDownload(modelId) {
    const ctx = this.activeDownloads.get(modelId);
    if (!ctx) {
      return { status: 'idle' };
    }
    if (ctx.child) {
      ctx.child.kill('SIGINT');
    }
    if (ctx.timer) {
      clearInterval(ctx.timer);
    }
    this.activeDownloads.delete(modelId);
    this.broadcast('asr-model-download-cancelled', {
      modelId,
      repoId: ctx.repoId,
    });
    return { status: 'cancelled' };
  }

  shutdown() {
    this.activeDownloads.forEach((ctx, modelId) => {
      if (ctx.child) {
        try {
          ctx.child.kill('SIGINT');
        } catch {
          // ignore
        }
      }
      if (ctx.timer) {
        clearInterval(ctx.timer);
      }
      this.broadcast('asr-model-download-cancelled', {
        modelId,
        repoId: ctx.repoId,
      });
    });
    this.activeDownloads.clear();
  }

  broadcast(channel, payload) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => {
      window.webContents.send(channel, payload);
    });
  }
}
