import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { promisify } from 'util';
import * as logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

/**
 * Whisper.cpp CLI 服务
 * 使用预编译的 whisper-cli 二进制文件进行语音识别
 * 无需编译 Node.js addon，开箱即用
 */
class WhisperServiceCLI {
    constructor() {
        this.isInitialized = false;
        this.modelPath = null;
        this.cliPath = null;

        // 音频缓冲区
        this.audioBuffer = [];
        this.bufferSizeLimit = 30 * 16000;
        this.bufferStartTime = 0;

        // VAD 相关
        this.vadResults = [];
        this.lastSpeechEndTime = 0;

        // 配置
        this.retainAudioFiles = false;
        this.audioStoragePath = null;

        // 当前句子
        this.currentSentence = {
            startTime: 0,
            audioData: [],
            text: '',
            isRecognizing: false
        };

        logger.log('WhisperServiceCLI created');
    }

    /**
     * 初始化
     */
    async initialize(modelName, options = {}) {
        try {
            logger.log('Initializing Whisper CLI service...');
            logger.log(`Model: ${modelName}`);

            // 设置配置
            this.retainAudioFiles = options.retainAudioFiles || false;
            this.audioStoragePath = options.audioStoragePath;

            // 查找 whisper-cli 二进制文件
            const projectRoot = path.join(__dirname, '../..');
            const possiblePaths = [
                // 预编译二进制（按平台）
                path.join(projectRoot, 'third_party/whisper.cpp/prebuilt', process.platform, process.arch, 'whisper-cli'),
                path.join(projectRoot, 'third_party/whisper.cpp/prebuilt', process.platform, process.arch, 'whisper-cli.exe'),
                // 本地编译的二进制
                path.join(projectRoot, 'third_party/whisper.cpp/build/bin/whisper-cli'),
                path.join(projectRoot, 'third_party/whisper.cpp/build/bin/whisper-cli.exe'),
            ];

            for (const testPath of possiblePaths) {
                if (fs.existsSync(testPath)) {
                    this.cliPath = testPath;
                    logger.log(`Found whisper-cli at: ${testPath}`);
                    break;
                }
            }

            if (!this.cliPath) {
                throw new Error(
                    'Whisper CLI binary not found. Please run: npm run setup-whisper-cpp'
                );
            }

            // 检查模型文件
            const modelsDir = path.join(projectRoot, 'models');
            this.modelPath = path.join(modelsDir, modelName);

            if (!fs.existsSync(this.modelPath)) {
                throw new Error(
                    `Model file not found: ${this.modelPath}\n` +
                    'Please download the model first: npm run download-ggml-models'
                );
            }

            // 测试 CLI 是否可执行
            await this.testCLI();

            this.isInitialized = true;
            logger.log('WhisperServiceCLI initialized successfully');

            return true;
        } catch (error) {
            logger.error('Error initializing WhisperServiceCLI:', error);
            throw error;
        }
    }

    /**
     * 测试 CLI 是否正常工作
     */
    async testCLI() {
        return new Promise((resolve, reject) => {
            const proc = spawn(this.cliPath, ['--help']);
            let output = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0 || output.includes('whisper')) {
                    resolve();
                } else {
                    reject(new Error('whisper-cli test failed'));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });

            setTimeout(() => {
                proc.kill();
                reject(new Error('whisper-cli test timeout'));
            }, 5000);
        });
    }

    /**
     * 添加音频块
     */
    async addAudioChunk(audioChunk, timestamp) {
        try {
            if (!this.isInitialized) {
                throw new Error('WhisperServiceCLI not initialized');
            }

            // 预处理音频（确保16kHz）
            const processedChunk = this.preprocessAudio(audioChunk);

            // 添加到缓冲区
            this.audioBuffer.push(...processedChunk);

            // 限制缓冲区大小
            if (this.audioBuffer.length > this.bufferSizeLimit) {
                const removeCount = this.audioBuffer.length - this.bufferSizeLimit;
                this.audioBuffer.splice(0, removeCount);
                this.bufferStartTime = timestamp - (this.bufferSizeLimit / 16);
            }

            // 检查句子边界
            const sentenceBoundary = this.checkSentenceBoundary(timestamp);

            if (sentenceBoundary.shouldSplit && !this.currentSentence.isRecognizing) {
                const sentenceAudio = this.extractSentenceAudio(sentenceBoundary);

                this.currentSentence.isRecognizing = true;
                const result = await this.transcribeSentence(sentenceAudio, sentenceBoundary);

                // 重置
                this.currentSentence = {
                    startTime: timestamp,
                    audioData: [],
                    text: '',
                    isRecognizing: false
                };

                return result;
            }

            // 累积当前句子
            this.currentSentence.audioData.push(...processedChunk);

            return null;
        } catch (error) {
            logger.error('Error processing audio chunk:', error);
            throw error;
        }
    }

    /**
     * 转录句子
     */
    async transcribeSentence(audioData, boundary) {
        try {
            if (audioData.length === 0) {
                return null;
            }

            logger.log(`Transcribing audio segment: ${audioData.length} samples`);

            // 创建临时 WAV 文件
            const tmpDir = path.join(__dirname, '../../.temp');
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }

            const tmpWavPath = path.join(tmpDir, `temp-${Date.now()}.wav`);
            await this.writeWAVFile(tmpWavPath, audioData, 16000);

            try {
                // 调用 whisper-cli
                const result = await this.runWhisperCLI(tmpWavPath);

                if (result && result.trim()) {
                    return {
                        text: result.trim(),
                        confidence: 0.9, // CLI 不提供置信度
                        startTime: boundary.startTime,
                        endTime: boundary.endTime,
                        audioDuration: audioData.length / 16000,
                        audioData: new Float32Array(audioData)
                    };
                }

                return null;
            } finally {
                // 清理临时文件
                try {
                    await unlink(tmpWavPath);
                } catch (err) {
                    logger.warn('Failed to delete temp WAV file:', err.message);
                }
            }
        } catch (error) {
            logger.error('Error transcribing sentence:', error);
            return null;
        }
    }

    /**
     * 运行 whisper-cli
     */
    async runWhisperCLI(wavPath) {
        return new Promise((resolve, reject) => {
            const args = [
                '-m', this.modelPath,
                '-f', wavPath,
                '-l', 'zh',
                '--no-timestamps',
                '-nt' // 不输出 tokens
            ];

            const proc = spawn(this.cliPath, args);
            let output = '';
            let errorOutput = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    // 提取转录结果（通常在最后几行）
                    const lines = output.split('\n').filter(line => line.trim());
                    const transcription = lines[lines.length - 1] || '';
                    resolve(transcription);
                } else {
                    logger.error('whisper-cli error:', errorOutput);
                    resolve(''); // 失败时返回空字符串
                }
            });

            proc.on('error', (err) => {
                logger.error('Failed to spawn whisper-cli:', err);
                resolve('');
            });

            // 超时保护
            setTimeout(() => {
                proc.kill();
                resolve('');
            }, 30000); // 30秒超时
        });
    }

    /**
     * 写入 WAV 文件
     */
    async writeWAVFile(filePath, audioData, sampleRate) {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = audioData.length * 2; // 16-bit = 2 bytes per sample

        const buffer = Buffer.alloc(44 + dataSize);

        // WAV header
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + dataSize, 4);
        buffer.write('WAVE', 8);
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16); // fmt chunk size
        buffer.writeUInt16LE(1, 20); // PCM format
        buffer.writeUInt16LE(numChannels, 22);
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(byteRate, 28);
        buffer.writeUInt16LE(blockAlign, 32);
        buffer.writeUInt16LE(bitsPerSample, 34);
        buffer.write('data', 36);
        buffer.writeUInt32LE(dataSize, 40);

        // Audio data
        for (let i = 0; i < audioData.length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            const intSample = Math.round(sample * 32767);
            buffer.writeInt16LE(intSample, 44 + i * 2);
        }

        await writeFile(filePath, buffer);
    }

    /**
     * 预处理音频
     */
    preprocessAudio(audioBuffer, originalSampleRate = 16000) {
        if (originalSampleRate === 16000) {
            return audioBuffer;
        }

        // 简单重采样
        const ratio = 16000 / originalSampleRate;
        const targetLength = Math.floor(audioBuffer.length * ratio);
        const result = new Float32Array(targetLength);

        for (let i = 0; i < targetLength; i++) {
            const sourceIndex = i / ratio;
            const index = Math.floor(sourceIndex);
            const fraction = sourceIndex - index;

            if (index >= audioBuffer.length - 1) {
                result[i] = audioBuffer[audioBuffer.length - 1];
            } else {
                result[i] = audioBuffer[index] * (1 - fraction) + audioBuffer[index + 1] * fraction;
            }
        }

        return result;
    }

    /**
     * 检查句子边界
     */
    checkSentenceBoundary(timestamp) {
        const pauseThreshold = 1000;
        const maxSentenceLength = 20000;

        const currentSentenceDuration = timestamp - this.currentSentence.startTime;

        if (currentSentenceDuration >= maxSentenceLength) {
            return {
                shouldSplit: true,
                startIndex: 0,
                endIndex: this.audioBuffer.length,
                startTime: this.currentSentence.startTime,
                endTime: timestamp
            };
        }

        const timeSinceLastSpeech = timestamp - this.lastSpeechEndTime;
        if (timeSinceLastSpeech >= pauseThreshold && currentSentenceDuration > 500) {
            this.lastSpeechEndTime = timestamp;
            return {
                shouldSplit: true,
                startIndex: 0,
                endIndex: this.audioBuffer.length,
                startTime: this.currentSentence.startTime,
                endTime: timestamp
            };
        }

        return { shouldSplit: false };
    }

    /**
     * 提取句子音频
     */
    extractSentenceAudio(boundary) {
        return new Float32Array(this.currentSentence.audioData);
    }

    /**
     * 保存音频文件
     */
    async saveAudioFile(audioData, recordId, conversationId, sourceId) {
        // 实现音频保存逻辑
        return null;
    }

    /**
     * 销毁
     */
    destroy() {
        this.audioBuffer = [];
        this.currentSentence = {
            startTime: 0,
            audioData: [],
            text: '',
            isRecognizing: false
        };
        logger.log('WhisperServiceCLI destroyed');
    }
}

export default WhisperServiceCLI;
