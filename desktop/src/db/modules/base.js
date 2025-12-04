import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from 'electron';

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class DatabaseBase {
  constructor(options = {}) {
    // 数据库文件路径
    const customPath = options.dbPath || process.env.LIVEGALGAME_DB_PATH;
    const isPackaged = app?.isPackaged;

    // 默认使用用户数据目录，若开发环境则使用仓库内 data
    const defaultDbPath = customPath
      ? path.resolve(customPath)
      : isPackaged
        ? path.join(app.getPath('userData'), 'livegalgame.db')
        : path.join(__dirname, '../../data/livegalgame.db');

    this.dbPath = defaultDbPath;

    // 打包后首次运行：从内置 seed DB 复制到用户目录
    if (isPackaged && !fs.existsSync(this.dbPath)) {
      const resourceSeed = process.resourcesPath
        ? path.join(process.resourcesPath, 'data', 'livegalgame.db')
        : null;
      const asarSeed = path.join(app.getAppPath(), 'data', 'livegalgame.db');
      const seedDb = (resourceSeed && fs.existsSync(resourceSeed))
        ? resourceSeed
        : asarSeed;

      if (seedDb && fs.existsSync(seedDb)) {
        const dataDir = path.dirname(this.dbPath);
        fs.mkdirSync(dataDir, { recursive: true });
        fs.copyFileSync(seedDb, this.dbPath);
        console.log(`[DB] seeded database to ${this.dbPath}`);
      }
    }

    // 确保data目录存在
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 创建数据库连接
    this.db = new Database(this.dbPath, {
      verbose: console.log // 关闭 SQL 语句打印，避免每次启动都输出数据库 schema
    });

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
          this.db.exec(statement);
        }
      }
    });

    transaction();
    console.log('Database schema initialized');

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