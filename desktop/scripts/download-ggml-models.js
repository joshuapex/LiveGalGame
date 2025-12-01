#!/usr/bin/env node

/**
 * GGML 模型下载脚本
 * 下载 whisper.cpp 使用的 GGML 格式模型
 * 模型更小，性能更好
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录
const projectRoot = path.join(__dirname, '..');
const modelsDir = path.join(projectRoot, 'models');

// GGML 模型列表（从 Hugging Face ggerganov/whisper.cpp 下载）
const GGML_MODELS = {
  'ggml-tiny.bin': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    size: '~75MB',
    description: '最小模型，适合低端设备'
  },
  'ggml-base.bin': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    size: '~150MB',
    description: '平衡模型，推荐用于大多数设备'
  },
  'ggml-small.bin': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    size: '~500MB',
    description: '较大模型，准确率更高'
  }
};

// 默认下载的模型
const DEFAULT_MODELS = ['ggml-base.bin'];

/**
 * 下载文件
 */
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filePath);

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 处理重定向
        return downloadFile(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(filePath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      const startTime = Date.now();

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const progress = totalSize ? ((downloadedSize / totalSize) * 100).toFixed(1) : '?';
        const speed = ((downloadedSize / 1024 / 1024) / ((Date.now() - startTime) / 1000)).toFixed(2);
        process.stdout.write(`\r下载进度: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(2)}MB / ${totalSize ? (totalSize / 1024 / 1024).toFixed(2) : '?'}MB) - ${speed}MB/s`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        process.stdout.write('\n');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      reject(err);
    });
  });
}

/**
 * 下载单个模型
 */
async function downloadModel(modelName) {
  const modelInfo = GGML_MODELS[modelName];
  if (!modelInfo) {
    console.error(`未知模型: ${modelName}`);
    return false;
  }

  const filePath = path.join(modelsDir, modelName);

  // 检查文件是否已存在
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > 0) {
      console.log(`\n模型 ${modelName} 已存在，跳过下载`);
      return true;
    }
  }

  console.log(`\n正在下载模型: ${modelName}`);
  console.log(`描述: ${modelInfo.description}`);
  console.log(`大小: ${modelInfo.size}`);
  console.log(`保存位置: ${filePath}`);

  try {
    const startTime = Date.now();
    await downloadFile(modelInfo.url, filePath);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`✓ 模型 ${modelName} 下载完成`);
    console.log(`  文件大小: ${sizeMB}MB`);
    console.log(`  耗时: ${duration}秒`);

    return true;
  } catch (error) {
    console.error(`✗ 模型 ${modelName} 下载失败:`, error.message);
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      console.error('  网络连接问题，请检查网络或稍后重试');
    }
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  // 确保模型目录存在
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const modelsToDownload = process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : DEFAULT_MODELS;

  console.log('='.repeat(60));
  console.log('开始下载 GGML 格式的 Whisper 模型...');
  console.log(`模型保存目录: ${modelsDir}`);
  console.log('='.repeat(60));
  console.log(`\n计划下载的模型: ${modelsToDownload.join(', ')}\n`);

  // 显示可用模型列表
  console.log('可用模型列表:');
  Object.keys(GGML_MODELS).forEach(name => {
    const info = GGML_MODELS[name];
    console.log(`  - ${name}: ${info.size} - ${info.description}`);
  });
  console.log('');

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
  console.log('\n注意: GGML 格式的模型比 transformers.js 的模型更小，性能更好！');
}

main().catch(error => {
  console.error('下载过程中发生错误:', error);
  process.exit(1);
});






