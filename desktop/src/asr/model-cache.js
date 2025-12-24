import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import * as logger from '../utils/logger.js';
import { getAsrModelPreset } from '../shared/asr-models.js';

export function safeDirSize(targetPath) {
  try {
    const stat = fs.statSync(targetPath, { throwIfNoEntry: false });
    if (!stat) return 0;
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
    let total = 0;
    const stack = [targetPath];
    while (stack.length) {
      const dir = stack.pop();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile()) {
          try {
            total += fs.statSync(full).size;
          } catch {
            // ignore stat errors
          }
        } else if (entry.isDirectory()) {
          stack.push(full);
        }
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export function getRepoPathsForModel(preset, cacheDir) {
  const paths = [];
  if (!preset || !cacheDir) return paths;

  if (preset.repoId) {
    const repoSafe = `models--${preset.repoId.replace(/\//g, '--')}`;
    paths.push(path.join(cacheDir, repoSafe));
  }
  if (preset.modelScopeRepoId) {
    paths.push(path.join(cacheDir, 'models', preset.modelScopeRepoId));
    paths.push(path.join(cacheDir, preset.modelScopeRepoId));
    paths.push(path.join(os.homedir(), '.cache', 'modelscope', 'hub', 'models', preset.modelScopeRepoId));
    paths.push(path.join(os.homedir(), '.cache', 'modelscope', 'hub', preset.modelScopeRepoId));
  }

  if (preset.onnxModels) {
    const modelDirs = Array.from(new Set(Object.values(preset.onnxModels).filter(Boolean)));
    modelDirs.forEach((modelDir) => {
      paths.push(path.join(cacheDir, modelDir));
      paths.push(path.join(cacheDir, 'models', modelDir));
    });
  }
  return paths;
}

export function cleanModelScopeLocks(cacheDir, maxAgeMs = 10 * 60 * 1000) {
  if (!cacheDir) return;
  const lockDir = path.join(cacheDir, '.lock');
  try {
    const entries = fs.readdirSync(lockDir, { withFileTypes: true });
    const now = Date.now();
    entries.forEach((entry) => {
      if (!entry.isFile()) return;
      const full = path.join(lockDir, entry.name);
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs < now - maxAgeMs) {
          fs.unlinkSync(full);
          logger.log(`[ASR] Removed stale ModelScope lock: ${entry.name}`);
        }
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore if lock dir missing
  }
}

function getModelCacheCandidates() {
  const homeDir = os.homedir();
  const userDataDir = app.getPath('userData');
  const msEnv = process.env.MODELSCOPE_CACHE || process.env.MODELSCOPE_CACHE_HOME;
  const msBase = msEnv && path.basename(msEnv).toLowerCase() === 'hub' ? path.dirname(msEnv) : msEnv;
  const msHub = msBase ? path.join(msBase, 'hub') : (msEnv && path.basename(msEnv).toLowerCase() === 'hub' ? msEnv : null);
  const appMsBase = path.join(userDataDir, 'asr-cache', 'modelscope');
  const appMsHub = path.join(appMsBase, 'hub');

  return [
    msHub,
    msBase,
    process.env.ASR_CACHE_DIR,
    process.env.HF_HOME ? path.join(process.env.HF_HOME, 'hub') : null,
    appMsHub,  // model-manager.js 默认下载位置（ModelScope hub）
    appMsBase, // model-manager.js 默认下载位置（ModelScope base）
    path.join(userDataDir, 'hf-home', 'hub'),
    path.join(userDataDir, 'ms-cache'),
    homeDir ? path.join(homeDir, '.cache', 'huggingface', 'hub') : null,
    homeDir ? path.join(homeDir, '.cache', 'modelscope', 'hub') : null,
  ].filter(Boolean);
}

export function resolveModelCache(modelName) {
  const preset = getAsrModelPreset(modelName);
  const repoId = preset?.repoId || (typeof modelName === 'string' && modelName.includes('/') ? modelName : null);
  const repoSafe = repoId ? `models--${repoId.replace(/\//g, '--')}` : null;
  const msRepoId = preset?.modelScopeRepoId;
  const candidates = getModelCacheCandidates();

  for (const candidate of candidates) {
    try {
      if (repoSafe && fs.existsSync(path.join(candidate, repoSafe))) {
        return { cacheDir: candidate, found: true };
      }
      if (msRepoId && fs.existsSync(path.join(candidate, 'models', msRepoId))) {
        return { cacheDir: candidate, found: true };
      }
    } catch {
      // ignore and continue
    }
  }

  if (msRepoId) {
    const msDefault = path.join(os.homedir(), '.cache', 'modelscope', 'hub');
    if (fs.existsSync(path.join(msDefault, 'models', msRepoId))) {
      return { cacheDir: msDefault, found: true };
    }
  }

  return { cacheDir: candidates[0] || path.join(app.getPath('userData'), 'hf-home', 'hub'), found: false };
}

export function resolveFunasrModelScopeCache(preset) {
  if (!preset?.onnxModels) {
    return null;
  }
  const modelDirs = Array.from(new Set(Object.values(preset.onnxModels).filter(Boolean)));

  const systemMsCache = path.join(os.homedir(), '.cache', 'modelscope', 'hub');
  try {
    let systemHit = false;
    let systemBytes = 0;
    for (const dir of modelDirs) {
      const p1 = path.join(systemMsCache, dir);
      const p2 = path.join(systemMsCache, 'models', dir);
      if (fs.existsSync(p1)) {
        systemHit = true;
        systemBytes += safeDirSize(p1);
      } else if (fs.existsSync(p2)) {
        systemHit = true;
        systemBytes += safeDirSize(p2);
      }
    }
    if (systemHit && systemBytes > 0) {
      return { cacheDir: systemMsCache, found: true };
    }
  } catch {
    // ignore and continue
  }

  const candidates = getModelCacheCandidates();
  let best = null;
  let bestBytes = -1;
  for (const candidate of candidates) {
    if (candidate === systemMsCache) continue;

    try {
      let hit = false;
      let bytes = 0;
      for (const dir of modelDirs) {
        const p1 = path.join(candidate, dir);
        const p2 = path.join(candidate, 'models', dir);
        if (fs.existsSync(p1)) {
          hit = true;
          bytes += safeDirSize(p1);
        } else if (fs.existsSync(p2)) {
          hit = true;
          bytes += safeDirSize(p2);
        }
      }
      if (hit && bytes > bestBytes) {
        best = { cacheDir: candidate, found: true };
        bestBytes = bytes;
      }
    } catch {
      // ignore and continue
    }
  }
  if (best) return best;

  return { cacheDir: systemMsCache, found: false };
}
