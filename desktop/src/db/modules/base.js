import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { fileURLToPath } from 'url';

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isDirWritable(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export default class DatabaseBase {
  constructor(options = {}) {
    // 数据库文件路径优先级：
    // 1) 显式传入 options.dbPath
    // 2) 环境变量 LIVEGALGAME_DB_PATH
    // 3) Electron userData 目录下的 livegalgame.db（可写）
    // 4) 回落到仓库内 data 目录（开发模式）
    const customPath = options.dbPath || process.env.LIVEGALGAME_DB_PATH;
    const isPackaged = app?.isPackaged;
    const repoDefaultPath = path.join(__dirname, '../../data/livegalgame.db');
    const userDataDir = app?.getPath ? app.getPath('userData') : null;
    const userDbPath = userDataDir ? path.join(userDataDir, 'livegalgame.db') : null;

    // 备选路径按照可写优先级排序
    const candidates = [
      customPath ? path.resolve(customPath) : null,
      userDbPath,
      repoDefaultPath,
    ].filter(Boolean);

    let resolvedPath = candidates.find((p) => isDirWritable(path.dirname(p)));
    if (!resolvedPath) {
      // 最后兜底：临时目录
      const tmpPath = path.join(app?.getPath?.('temp') || '/tmp', 'livegalgame.db');
      if (isDirWritable(path.dirname(tmpPath))) {
        resolvedPath = tmpPath;
        console.warn('[DB] All preferred locations not writable, falling back to temp DB:', resolvedPath);
      } else {
        throw new Error('No writable location found for database file');
      }
    }

    // 如目标是用户目录且不存在，优先尝试从打包资源或仓库模板拷贝
    try {
      if (resolvedPath === userDbPath && !fs.existsSync(resolvedPath)) {
        // 打包场景：resources/data/livegalgame.db 或 app.asar/data/livegalgame.db
        const resourceSeed = process.resourcesPath
          ? path.join(process.resourcesPath, 'data', 'livegalgame.db')
          : null;
        const asarSeed = path.join(app.getAppPath(), 'data', 'livegalgame.db');
        const seedDb = (resourceSeed && fs.existsSync(resourceSeed))
          ? resourceSeed
          : fs.existsSync(asarSeed)
            ? asarSeed
            : null;

        const fallbackSeed = fs.existsSync(repoDefaultPath) ? repoDefaultPath : null;
        const source = seedDb || fallbackSeed;

        if (source) {
          fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
          fs.copyFileSync(source, resolvedPath);
          console.log(`[DB] seeded database to ${resolvedPath} from ${seedDb ? 'package' : 'repo'}`);
        }
      }
    } catch (copyErr) {
      console.error('[DB] Failed to bootstrap userData database:', copyErr);
    }

    this.dbPath = resolvedPath;

    // 确保数据库目录存在
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 创建数据库连接
    this.db = new Database(this.dbPath, {
      // 过滤掉注释和空行，减少乱码可能性并保持日志整洁
      verbose: (sql) => {
        if (sql.trim().startsWith('--')) return;
        console.log(sql);
      } 
    });

    // 启用 WAL 模式以提高性能和并发
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    try {
      fs.accessSync(this.dbPath, fs.constants.W_OK);
      console.log('[DB] Using writable database at:', this.dbPath);
    } catch {
      console.warn('[DB] Database path may be read-only:', this.dbPath);
    }

    // 启用外键约束
    this.db.pragma('foreign_keys = ON');

    // 初始化数据库表
    this.initialize();

    console.log('Database initialized at:', this.dbPath);
  }

  // 初始化数据库表
  initialize() {
    console.log('Initializing database schema...');
    const schemaPath = path.join(__dirname, '../schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // 执行SQL语句（分割并逐条执行）
    const statements = schema.split(';').filter(stmt => stmt.trim());

    // 开始事务
    const transaction = this.db.transaction(() => {
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            this.db.exec(statement);
          } catch (err) {
            const msg = String(err?.message || err);
            const upper = statement.trim().toUpperCase();
            const ignorableIndexError =
              upper.startsWith('CREATE INDEX') &&
              (msg.includes('no such column') || msg.includes('has no column'));
            if (ignorableIndexError) {
              // 兼容老库：表已存在但列还未迁移时，schema.sql 的新索引会失败。后续 ensureSuggestionDecisionSchema 会补齐。
              console.warn('[DB] Ignoring index creation error (will be fixed by migration):', msg);
              continue;
            }
            throw err;
          }
        }
      }
    });

    transaction();
    console.log('Database schema initialized');

    // 预先执行关键迁移，避免 seed.sql 因旧表结构导致插入失败
    try {
      if (typeof this.ensureSuggestionDecisionSchema === 'function') {
        this.ensureSuggestionDecisionSchema();
      }
    } catch (err) {
      console.warn('[DB] ensureSuggestionDecisionSchema failed (will retry lazily on access):', err);
    }

    // 初始化示例数据（如果数据库为空）
    this.seedSampleData();

    // 初始化默认 ASR 配置（如果没有）
    this.seedDefaultASRConfig();

    // 修复 ASR 配置（迁移旧的/错误的模型名称）
    this.fixASRConfig();

    // 初始化默认音频源（如果没有）
    this.seedDefaultAudioSources();

    // 初始化默认对话建议配置
    if (typeof this.seedDefaultSuggestionConfig === 'function') {
      this.seedDefaultSuggestionConfig();
    }
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
