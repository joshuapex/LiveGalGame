import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 获取 __dirname 的 ESM 等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class DatabaseBase {
  constructor(options = {}) {
    // 数据库文件路径
    const customPath = options.dbPath || process.env.LIVEGALGAME_DB_PATH;
    const resolvedPath = customPath
      ? path.resolve(customPath)
      : path.join(__dirname, '../../data/livegalgame.db');
    this.dbPath = resolvedPath;

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