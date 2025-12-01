/**
 * 音频捕获服务（在渲染进程中运行）
 * 使用 electron-audio-loopback + getDisplayMedia 捕获系统音频
 * 使用 getUserMedia 捕获麦克风音频
 */
class AudioCaptureService {
  constructor() {
    this.audioContext = null;
    this.sourceNodes = new Map(); // sourceId -> MediaStreamAudioSourceNode
    this.scriptProcessors = new Map(); // sourceId -> ScriptProcessorNode
    this.streams = new Map(); // sourceId -> MediaStream
    this.isCapturing = false;

    // 音频参数
    this.sampleRate = 16000; // Whisper 要求的采样率
    this.bufferSize = 4096; // 脚本处理器缓冲区大小

    // 【优化】与FunASR的chunkStride对齐：9600 samples = 600ms
    this.targetChunkSamples = 9600;
    this.sendInterval = 600; // 发送间隔（ms）

    // 【VAD】静音检测配置 - 过滤静音，避免 ASR 模型产生幻觉
    this.silenceThreshold = 0.008; // 静音阈值（RMS能量），低于此值视为静音
    this.silenceSkipCount = new Map(); // sourceId -> 连续跳过静音的次数
    this.maxSilenceSkipLog = 5; // 最多打印几次静音跳过日志

    // 音频数据累积
    this.audioAccumulators = new Map(); // sourceId -> Float32Array
    this.lastSendTime = new Map(); // sourceId -> timestamp

    // 【共享流】已授权的系统音频流（跨窗口共享）
    this.cachedSystemAudioStream = null;
    this.systemAudioStreamAuthorized = false;

    // 事件监听器
    this.listeners = new Map();

    console.log('[AudioCaptureService] Created');
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[AudioCaptureService] Error in listener for ${event}:`, err);
        }
      });
    }
  }

  /**
   * 初始化音频上下文
   */
  async initialize() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      console.log('[AudioCaptureService] Initialized, sample rate:', this.sampleRate);
      return true;
    } catch (error) {
      console.error('[AudioCaptureService] Error initializing:', error);
      throw error;
    }
  }

  /**
   * 开始捕获麦克风音频
   * @param {string} sourceId - 音频源 ID（speaker1）
   * @param {string} deviceId - 音频设备 ID
   */
  async startMicrophoneCapture(sourceId, deviceId = null) {
    try {
      if (!this.audioContext) {
        await this.initialize();
      }

      // 如果已经在捕获，先停止
      if (this.streams.has(sourceId)) {
        await this.stopCapture(sourceId);
      }

      console.log(`[AudioCaptureService] Starting microphone capture for ${sourceId}, device: ${deviceId || 'default'}`);

      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: this.sampleRate,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(`[AudioCaptureService] ✅ Microphone stream obtained`);

      this.setupAudioProcessing(sourceId, stream);
      return true;
    } catch (error) {
      console.error(`[AudioCaptureService] ❌ Error starting microphone capture:`, error);
      throw error;
    }
  }

  /**
   * 开始捕获系统音频（使用 electron-audio-loopback）
   * @param {string} sourceId - 音频源 ID（speaker2）
   * @param {Object} options - 选项
   * @param {boolean} options.useCachedStream - 是否使用已缓存的流（避免弹出选择窗口）
   * @param {boolean} options.forceNewStream - 强制获取新流（忽略缓存）
   */
  async startSystemAudioCapture(sourceId, options = {}) {
    try {
      const { useCachedStream = true, forceNewStream = false } = options;

      if (!this.audioContext) {
        await this.initialize();
      }

      // 如果已经在捕获，先停止
      if (this.streams.has(sourceId)) {
        await this.stopCapture(sourceId);
      }

      console.log(`[AudioCaptureService] Starting system audio capture for ${sourceId}, options:`, { useCachedStream, forceNewStream });

      // 【优化】优先使用已缓存的系统音频流（避免每次都弹出选择窗口）
      if (useCachedStream && !forceNewStream && this.cachedSystemAudioStream) {
        const audioTracks = this.cachedSystemAudioStream.getAudioTracks();
        const hasActiveTrack = audioTracks.some(track => track.readyState === 'live' && track.enabled);

        if (hasActiveTrack) {
          console.log(`[AudioCaptureService] ✅ Using cached system audio stream with ${audioTracks.length} audio track(s)`);
          this.setupAudioProcessing(sourceId, this.cachedSystemAudioStream);
          return true;
        } else {
          console.log('[AudioCaptureService] Cached stream is no longer active, will request new stream');
          this.cachedSystemAudioStream = null;
          this.systemAudioStreamAuthorized = false;
        }
      }

      // 使用 electron-audio-loopback 方案
      // 1. 启用 loopback 音频
      if (window.electronAPI?.enableLoopbackAudio) {
        await window.electronAPI.enableLoopbackAudio();
        console.log('[AudioCaptureService] Loopback audio enabled');
      }

      let displayStream;

      // 尝试使用 getDesktopSourceId 获取源 ID，以避开选择器弹窗
      if (window.electronAPI?.getDesktopSourceId) {
        try {
          const sourceId = await window.electronAPI.getDesktopSourceId();
          if (sourceId) {
            console.log(`[AudioCaptureService] Got desktop source ID: ${sourceId}, attempting getUserMedia`);
            displayStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId
                }
              },
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId
                }
              }
            });
            console.log('[AudioCaptureService] ✅ System audio stream obtained via getUserMedia (no picker)');
          }
        } catch (err) {
          console.warn('[AudioCaptureService] Failed to get stream via getUserMedia, falling back to getDisplayMedia:', err);
        }
      }

      // 如果 getUserMedia 失败或不可用，回退到 getDisplayMedia (会弹出选择器)
      if (!displayStream) {
        console.log('[AudioCaptureService] Falling back to getDisplayMedia (picker will appear)');
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true // 需要同时请求视频才能获取音频
        });
      }

      // 3. 禁用 loopback 音频（获取流后即可禁用）
      if (window.electronAPI?.disableLoopbackAudio) {
        await window.electronAPI.disableLoopbackAudio();
        console.log('[AudioCaptureService] Loopback audio disabled');
      }

      // 4. 停止视频轨道（我们只需要音频）
      const videoTracks = displayStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.stop();
        displayStream.removeTrack(track);
        console.log(`[AudioCaptureService] Video track stopped: ${track.label}`);
      });

      // 5. 检查音频轨道
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in display stream');
      }

      console.log(`[AudioCaptureService] ✅ System audio stream obtained with ${audioTracks.length} audio track(s)`);
      audioTracks.forEach((track, index) => {
        console.log(`[AudioCaptureService] Audio track ${index + 1}: label=${track.label}, enabled=${track.enabled}`);
      });

      // 【缓存】保存已授权的流供后续使用
      this.cachedSystemAudioStream = displayStream;
      this.systemAudioStreamAuthorized = true;
      console.log('[AudioCaptureService] System audio stream cached for reuse');

      this.setupAudioProcessing(sourceId, displayStream);
      return true;
    } catch (error) {
      console.error(`[AudioCaptureService] ❌ Error starting system audio capture:`, error);

      // 确保禁用 loopback
      if (window.electronAPI?.disableLoopbackAudio) {
        await window.electronAPI.disableLoopbackAudio().catch(() => { });
      }

      throw error;
    }
  }

  /**
   * 检查是否有已授权的系统音频流可用
   * @returns {boolean} 是否有可用的缓存流
   */
  hasAuthorizedSystemAudioStream() {
    if (!this.cachedSystemAudioStream) {
      return false;
    }
    const audioTracks = this.cachedSystemAudioStream.getAudioTracks();
    return audioTracks.some(track => track.readyState === 'live' && track.enabled);
  }

  /**
   * 获取系统音频流状态
   * @returns {Object} 状态信息
   */
  getSystemAudioStreamStatus() {
    if (!this.cachedSystemAudioStream) {
      return {
        available: false,
        authorized: false,
        message: '未授权系统音频，需要在设置页面测试音频后才能使用'
      };
    }

    const audioTracks = this.cachedSystemAudioStream.getAudioTracks();
    const hasActiveTrack = audioTracks.some(track => track.readyState === 'live' && track.enabled);

    if (hasActiveTrack) {
      return {
        available: true,
        authorized: true,
        trackCount: audioTracks.length,
        message: '系统音频已授权并可用'
      };
    } else {
      return {
        available: false,
        authorized: this.systemAudioStreamAuthorized,
        message: '系统音频流已过期，需要重新授权'
      };
    }
  }

  /**
   * 设置音频处理管道
   * @param {string} sourceId - 音频源 ID
   * @param {MediaStream} stream - 媒体流
   */
  setupAudioProcessing(sourceId, stream) {
    this.streams.set(sourceId, stream);

    // 创建音频源节点
    const sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNodes.set(sourceId, sourceNode);

    // 创建脚本处理器
    const scriptProcessor = this.audioContext.createScriptProcessor(
      this.bufferSize,
      1, // 输入声道数
      1  // 输出声道数
    );
    this.scriptProcessors.set(sourceId, scriptProcessor);

    // 初始化音频累积器
    this.audioAccumulators.set(sourceId, new Float32Array());
    this.lastSendTime.set(sourceId, Date.now());

    // 设置音频处理回调
    scriptProcessor.onaudioprocess = (event) => {
      this.handleAudioProcess(sourceId, event);
    };

    // 连接音频节点
    sourceNode.connect(scriptProcessor);
    scriptProcessor.connect(this.audioContext.destination);

    console.log(`[AudioCaptureService] ✅ Audio processing setup complete for ${sourceId}`);
    this.isCapturing = true;
  }

  /**
   * 处理音频数据
   */
  handleAudioProcess(sourceId, event) {
    try {
      const inputData = event.inputBuffer.getChannelData(0);

      // 计算实时音量 (RMS)
      let sumSquared = 0;
      for (let i = 0; i < inputData.length; i++) {
        sumSquared += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sumSquared / inputData.length);

      // 使用 dB 计算音量，使其更符合人耳感知 (Logarithmic)
      // 假设最小可感知音量为 -60dB，最大为 0dB
      let volume = 0;
      if (rms > 0) {
        const db = 20 * Math.log10(rms);
        // 将 -60dB ~ 0dB 映射到 0 ~ 100
        volume = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
      }

      // 发送音量更新事件 (限制频率)
      const now = Date.now();
      if (!this._lastVolumeEmit) this._lastVolumeEmit = {};
      if (!this._lastVolumeEmit[sourceId] || now - this._lastVolumeEmit[sourceId] > 50) {
        this.emit('volume-update', { sourceId, volume });
        this._lastVolumeEmit[sourceId] = now;
      }

      // 累积音频数据
      const accumulator = this.audioAccumulators.get(sourceId);
      const newAccumulator = new Float32Array(accumulator.length + inputData.length);
      newAccumulator.set(accumulator);
      newAccumulator.set(inputData, accumulator.length);
      this.audioAccumulators.set(sourceId, newAccumulator);

      const lastSend = this.lastSendTime.get(sourceId) || now;
      const timeSinceLastSend = now - lastSend;
      const accumulatedSamples = newAccumulator.length;

      // 双重条件触发发送
      const shouldSendByTime = timeSinceLastSend >= this.sendInterval;
      const shouldSendBySamples = accumulatedSamples >= this.targetChunkSamples;

      if (shouldSendByTime || shouldSendBySamples) {
        this.sendAudioData(sourceId, now);
      }
    } catch (error) {
      console.error(`[AudioCaptureService] Error processing audio for ${sourceId}:`, error);
    }
  }

  /**
   * 发送音频数据到主进程
   */
  sendAudioData(sourceId, timestamp) {
    try {
      const accumulator = this.audioAccumulators.get(sourceId);
      if (!accumulator || accumulator.length === 0) {
        return;
      }

      // 【VAD】静音检测 - 跳过静音数据，避免 ASR 模型产生幻觉
      if (this.isSilence(accumulator)) {
        // 清空累积器，避免累积
        this.audioAccumulators.set(sourceId, new Float32Array());
        this.lastSendTime.set(sourceId, timestamp);

        // 打印日志（限制频率，避免刷屏）
        const skipCount = (this.silenceSkipCount.get(sourceId) || 0) + 1;
        this.silenceSkipCount.set(sourceId, skipCount);
        if (skipCount <= this.maxSilenceSkipLog || skipCount % 50 === 0) {
          console.log(`[AudioCaptureService] 🔇 Skipping silence for ${sourceId} (count: ${skipCount})`);
        }
        return;
      }

      // 有声音时重置静音计数
      if (this.silenceSkipCount.get(sourceId) > 0) {
        console.log(`[AudioCaptureService] 🎤 Voice detected for ${sourceId} after ${this.silenceSkipCount.get(sourceId)} silence frames`);
        this.silenceSkipCount.set(sourceId, 0);
      }

      // 音频归一化处理
      const normalizedAudio = this.normalizeAudio(accumulator);

      // 发送音频数据到主进程
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('asr-audio-data', {
          sourceId,
          audioBuffer: Array.from(normalizedAudio),
          timestamp,
          sampleRate: this.sampleRate
        });

        // 每10次发送一次日志
        if (!this._sendCount) this._sendCount = {};
        if (!this._sendCount[sourceId]) this._sendCount[sourceId] = 0;
        this._sendCount[sourceId]++;
        if (this._sendCount[sourceId] % 10 === 0) {
          const durationMs = (normalizedAudio.length / this.sampleRate * 1000).toFixed(0);
          console.log(`[AudioCaptureService] Sent audio #${this._sendCount[sourceId]} for ${sourceId}, samples: ${normalizedAudio.length}, duration: ${durationMs}ms`);
        }
      }

      // 清空累积器
      this.audioAccumulators.set(sourceId, new Float32Array());
      this.lastSendTime.set(sourceId, timestamp);
    } catch (error) {
      console.error(`[AudioCaptureService] Error sending audio data for ${sourceId}:`, error);
    }
  }

  /**
   * 【VAD】静音检测 - 计算音频的 RMS 能量
   * @param {Float32Array} audioData - 音频数据
   * @returns {boolean} 是否为静音
   */
  isSilence(audioData) {
    if (!audioData || audioData.length === 0) {
      return true;
    }

    // 计算 RMS (Root Mean Square) 能量
    let sumSquared = 0;
    for (let i = 0; i < audioData.length; i++) {
      sumSquared += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sumSquared / audioData.length);

    return rms < this.silenceThreshold;
  }

  /**
   * 音频归一化处理
   */
  normalizeAudio(audioData) {
    if (!audioData || audioData.length === 0) {
      return audioData;
    }

    let maxAbs = 0;
    for (let i = 0; i < audioData.length; i++) {
      const abs = Math.abs(audioData[i]);
      if (abs > maxAbs) {
        maxAbs = abs;
      }
    }

    if (maxAbs < 0.001) {
      return audioData;
    }

    const normalized = new Float32Array(audioData.length);
    if (maxAbs > 0.95) {
      normalized.set(audioData);
    } else {
      const scale = Math.min(0.95 / maxAbs, 1.5);
      for (let i = 0; i < audioData.length; i++) {
        normalized[i] = audioData[i] * scale;
      }
    }

    return normalized;
  }

  /**
   * 停止捕获音频
   */
  async stopCapture(sourceId) {
    try {
      console.log(`[AudioCaptureService] Stopping capture for ${sourceId}`);

      const scriptProcessor = this.scriptProcessors.get(sourceId);
      if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor.onaudioprocess = null;
        this.scriptProcessors.delete(sourceId);
      }

      const sourceNode = this.sourceNodes.get(sourceId);
      if (sourceNode) {
        sourceNode.disconnect();
        this.sourceNodes.delete(sourceId);
      }

      const stream = this.streams.get(sourceId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        this.streams.delete(sourceId);
      }

      this.audioAccumulators.delete(sourceId);
      this.lastSendTime.delete(sourceId);

      console.log(`[AudioCaptureService] ✅ Capture stopped for ${sourceId}`);

      if (this.streams.size === 0) {
        this.isCapturing = false;
        console.log(`[AudioCaptureService] All captures stopped`);
      }

      return true;
    } catch (error) {
      console.error(`[AudioCaptureService] Error stopping capture for ${sourceId}:`, error);
      throw error;
    }
  }

  /**
   * 停止所有音频捕获
   */
  async stopAllCaptures() {
    try {
      console.log('[AudioCaptureService] Stopping all captures');

      const sourceIds = Array.from(this.streams.keys());
      for (const sourceId of sourceIds) {
        await this.stopCapture(sourceId);
      }

      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      console.log('[AudioCaptureService] All captures stopped');
      return true;
    } catch (error) {
      console.error('[AudioCaptureService] Error stopping all captures:', error);
      throw error;
    }
  }

  /**
   * 枚举音频输入设备
   */
  async enumerateDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `麦克风 ${device.deviceId.substring(0, 8)}`,
          kind: device.kind
        }));

      console.log(`[AudioCaptureService] Found ${audioInputs.length} audio input devices`);
      return audioInputs;
    } catch (error) {
      console.error('[AudioCaptureService] Error enumerating devices:', error);
      throw error;
    }
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      isCapturing: this.isCapturing,
      activeSources: Array.from(this.streams.keys()),
      sampleRate: this.sampleRate,
      audioContextState: this.audioContext ? this.audioContext.state : 'closed'
    };
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.stopAllCaptures();
    console.log('[AudioCaptureService] Destroyed');
  }
}

// 导出单例
const audioCaptureService = new AudioCaptureService();
export default audioCaptureService;
