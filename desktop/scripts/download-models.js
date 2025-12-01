#!/usr/bin/env node

/**
 * 模型预下载脚本
 * 在构建前下载所需的 Whisper 模型到本地 models 目录
 */

import { pipeline, env } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录
const projectRoot = path.join(__dirname, '..');
const modelsDir = path.join(projectRoot, 'models');

// 默认模型列表（可以根据需要添加更多）
const DEFAULT_MODELS = ['whisper-tiny', 'whisper-base', 'whisper-small'];

// 配置 transformers.js 使用本地模型目录
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// 设置缓存目录为本地 models 目录
env.cacheDir = modelsDir;

console.log('='.repeat(60));
console.log('开始下载 Whisper 模型...');
console.log(`模型保存目录: ${modelsDir}`);
console.log('='.repeat(60));

/**
 * 下载单个模型
 */
async function downloadModel(modelName) {
  const modelId = `Xenova/${modelName}`;
  console.log(`\n正在下载模型: ${modelId}`);
  console.log(`保存位置: ${modelsDir}`);

  try {
    const startTime = Date.now();
    
    // 加载模型（会自动下载并缓存）
    const model = await pipeline('automatic-speech-recognition', modelId);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✓ 模型 ${modelName} 下载完成 (耗时: ${duration}秒)`);
    
    // 清理模型实例以释放内存（注意：这里 model 是局部变量，不需要 this）
    // 模型已缓存到磁盘，可以安全释放内存引用
    
    return true;
  } catch (error) {
    console.error(`✗ 模型 ${modelName} 下载失败:`, error.message);
    if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
      console.error('  连接超时，请检查网络连接或使用代理');
    }
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  const modelsToDownload = process.argv.slice(2).length > 0 
    ? process.argv.slice(2) 
    : DEFAULT_MODELS;

  console.log(`\n计划下载的模型: ${modelsToDownload.join(', ')}\n`);

  const results = [];
  for (const modelName of modelsToDownload) {
    const success = await downloadModel(modelName);
    results.push({ model: modelName, success });
  }

  console.log('\n' + '='.repeat(60));
  console.log('下载完成！');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  
  console.log(`成功: ${successCount}, 失败: ${failCount}`);
  
  if (failCount > 0) {
    console.log('\n失败的模型:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.model}`);
    });
    process.exit(1);
  }
  
  console.log('\n所有模型已成功下载到:', modelsDir);
  console.log('这些模型将在构建时包含在 release 中。');
}

main().catch(error => {
  console.error('下载过程中发生错误:', error);
  process.exit(1);
});

