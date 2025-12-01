#!/usr/bin/env node

/**
 * 更新 ASR 默认配置为新模型
 * 使用方法: node scripts/update-asr-model.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../data/livegalgame.db');

console.log('正在连接数据库:', dbPath);

const db = new Database(dbPath);

try {
  // 获取当前默认配置
  const currentConfig = db.prepare('SELECT * FROM asr_configs WHERE is_default = 1 LIMIT 1').get();
  
  if (!currentConfig) {
    console.log('❌ 未找到默认 ASR 配置');
    console.log('正在创建新配置...');
    
    const newConfig = {
      id: `config_${Date.now()}`,
      model_name: 'ggml-whisper-large-zh-cv11-Q2_K.bin',
      language: 'zh',
      enable_vad: 1,
      sentence_pause_threshold: 1.0,
      retain_audio_files: 0,
      audio_retention_days: 30,
      audio_storage_path: null,
      is_default: 1,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    const stmt = db.prepare(`
      INSERT INTO asr_configs (
        id, model_name, language, enable_vad, sentence_pause_threshold,
        retain_audio_files, audio_retention_days, audio_storage_path,
        is_default, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      newConfig.id,
      newConfig.model_name,
      newConfig.language,
      newConfig.enable_vad,
      newConfig.sentence_pause_threshold,
      newConfig.retain_audio_files,
      newConfig.audio_retention_days,
      newConfig.audio_storage_path,
      newConfig.is_default,
      newConfig.created_at,
      newConfig.updated_at
    );
    
    console.log('✅ 已创建新配置:', newConfig.model_name);
  } else {
    console.log('当前默认配置:');
    console.log('  ID:', currentConfig.id);
    console.log('  模型:', currentConfig.model_name);
    console.log('  语言:', currentConfig.language);
    
    if (currentConfig.model_name === 'ggml-whisper-large-zh-cv11-Q2_K.bin') {
      console.log('✅ 配置已经是新模型，无需更新');
    } else {
      console.log('\n正在更新模型配置...');
      
      const updateStmt = db.prepare(`
        UPDATE asr_configs
        SET model_name = ?, updated_at = ?
        WHERE id = ?
      `);
      
      const result = updateStmt.run(
        'ggml-whisper-large-zh-cv11-Q2_K.bin',
        Date.now(),
        currentConfig.id
      );
      
      if (result.changes > 0) {
        console.log('✅ 配置已更新成功！');
        console.log('  新模型:', 'ggml-whisper-large-zh-cv11-Q2_K.bin');
      } else {
        console.log('❌ 更新失败');
      }
    }
  }
  
  // 验证更新结果
  const updatedConfig = db.prepare('SELECT * FROM asr_configs WHERE is_default = 1 LIMIT 1').get();
  console.log('\n当前默认配置:');
  console.log('  模型:', updatedConfig.model_name);
  console.log('  语言:', updatedConfig.language);
  
} catch (error) {
  console.error('❌ 错误:', error.message);
  process.exit(1);
} finally {
  db.close();
  console.log('\n数据库连接已关闭');
}

