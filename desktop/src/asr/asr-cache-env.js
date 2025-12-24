import fs from 'fs';
import path from 'path';

function ensureDir(targetPath) {
  try {
    fs.mkdirSync(targetPath, { recursive: true });
  } catch {
    // ignore mkdir errors
  }
}

export function computeAsrCachePaths({ userDataDir, asrCacheBase }) {
  const base = asrCacheBase || path.join(userDataDir, 'asr-cache');
  const hfHome = path.join(base, 'hf-home');
  const asrCacheDir = path.join(hfHome, 'hub');
  const msBase = path.join(base, 'modelscope');
  const msHub = path.join(msBase, 'hub');
  return {
    asrCacheBase: base,
    hfHome,
    asrCacheDir,
    modelscopeCacheBase: msBase,
    modelscopeCacheHub: msHub,
  };
}

export function applyAsrCacheEnv({ userDataDir, asrCacheBase, force = false }) {
  const paths = computeAsrCachePaths({ userDataDir, asrCacheBase });

  // 允许用户通过环境变量强制覆盖；否则用我们计算的默认值/GUI 配置值。
  if (force || !process.env.ASR_CACHE_BASE) {
    process.env.ASR_CACHE_BASE = paths.asrCacheBase;
  }

  if (force || !process.env.HF_HOME) {
    process.env.HF_HOME = paths.hfHome;
  }

  if (force || !process.env.ASR_CACHE_DIR) {
    process.env.ASR_CACHE_DIR = paths.asrCacheDir;
  }

  if (force) {
    process.env.MODELSCOPE_CACHE = paths.modelscopeCacheBase;
    process.env.MODELSCOPE_CACHE_HOME = paths.modelscopeCacheBase;
  } else if (!process.env.MODELSCOPE_CACHE && !process.env.MODELSCOPE_CACHE_HOME) {
    process.env.MODELSCOPE_CACHE = paths.modelscopeCacheBase;
    process.env.MODELSCOPE_CACHE_HOME = paths.modelscopeCacheBase;
  } else if (!process.env.MODELSCOPE_CACHE_HOME && process.env.MODELSCOPE_CACHE) {
    process.env.MODELSCOPE_CACHE_HOME = process.env.MODELSCOPE_CACHE;
  }

  // mkdir（不抛错）
  ensureDir(process.env.ASR_CACHE_BASE);
  ensureDir(process.env.HF_HOME);
  ensureDir(process.env.ASR_CACHE_DIR);
  if (process.env.MODELSCOPE_CACHE) {
    ensureDir(process.env.MODELSCOPE_CACHE);
    ensureDir(path.join(process.env.MODELSCOPE_CACHE, 'hub'));
  }

  return computeAsrCachePaths({
    userDataDir,
    asrCacheBase: process.env.ASR_CACHE_BASE,
  });
}
