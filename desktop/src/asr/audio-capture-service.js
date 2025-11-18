/**
 * 音频捕获服务（在渲染进程中运行）
 * 使用 Web Audio API 捕获音频并通过 IPC 发送到主进程
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
    this.sendInterval = 100; // 发送间隔（ms）

    // 音频数据累积
    this.audioAccumulators = new Map(); // sourceId -> Float32Array
    this.lastSendTime = new Map(); // sourceId -> timestamp

    console.log('AudioCaptureService created');
  }

  /**
   * 初始化音频上下文
   */
  async initialize() {
    try {
      // 创建音频上下文
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.sampleRate
      });

      console.log('AudioCaptureService initialized, sample rate:', this.sampleRate);
      return true;
    } catch (error) {
      console.error('Error initializing AudioCaptureService:', error);
      throw error;
    }
  }

  /**
   * 开始捕获音频
   * @param {string} sourceId - 音频源 ID（speaker1/speaker2）
   * @param {string} deviceId - 音频设备 ID（可选）
   */
  async startCapture(sourceId, deviceId = null) {
    try {
      if (!this.audioContext) {
        await this.initialize();
      }

      // 如果已经在捕获，先停止
      if (this.streams.has(sourceId)) {
        await this.stopCapture(sourceId);
      }

      console.log(`Starting audio capture for ${sourceId}, device: ${deviceId || 'default'}`);

      // 获取媒体权限
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: this.sampleRate,
          channelCount: 1, // 单声道
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.streams.set(sourceId, stream);

      // 创建音频源节点
      const sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNodes.set(sourceId, sourceNode);

      // 创建脚本处理器（用于捕获原始音频数据）
      const scriptProcessor = this.audioContext.createScriptProcessor(
        this.bufferSize,
        1, // 输入声道数
        1 // 输出声道数
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

      console.log(`Audio capture started for ${sourceId}`);
      this.isCapturing = true;

      return true;
    } catch (error) {
      console.error(`Error starting audio capture for ${sourceId}:`, error);
      throw error;
    }
  }

  /**
   * 处理音频数据（每 100ms 发送一次）
   * @param {string} sourceId - 音频源 ID
   * @param {AudioProcessingEvent} event - 音频处理事件
   */
  handleAudioProcess(sourceId, event) {
    try {
      // 获取音频数据
      const inputData = event.inputBuffer.getChannelData(0);

      // 累积音频数据
      const accumulator = this.audioAccumulators.get(sourceId);
      const newAccumulator = new Float32Array(accumulator.length + inputData.length);
      newAccumulator.set(accumulator);
      newAccumulator.set(inputData, accumulator.length);
      this.audioAccumulators.set(sourceId, newAccumulator);

      // 检查是否需要发送（每 100ms）
      const now = Date.now();
      const lastSend = this.lastSendTime.get(sourceId) || now;
      const timeSinceLastSend = now - lastSend;

      if (timeSinceLastSend >= this.sendInterval) {
        this.sendAudioData(sourceId, now);
      }
    } catch (error) {
      console.error(`Error processing audio for ${sourceId}:`, error);
    }
  }

  /**
   * 发送音频数据到主进程（IPC）
   * @param {string} sourceId - 音频源 ID
   * @param {number} timestamp - 时间戳
   */
  sendAudioData(sourceId, timestamp) {
    try {
      const accumulator = this.audioAccumulators.get(sourceId);
      if (!accumulator || accumulator.length === 0) {
        return;
      }

      // 发送音频数据到主进程
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('asr-audio-data', {
          sourceId,
          audioBuffer: Array.from(accumulator), // 转换为普通数组以便 IPC 传输
          timestamp,
          sampleRate: this.sampleRate
        });
      }

      // 清空累积器
      this.audioAccumulators.set(sourceId, new Float32Array());
      this.lastSendTime.set(sourceId, timestamp);
    } catch (error) {
      console.error(`Error sending audio data for ${sourceId}:`, error);
    }
  }

  /**
   * 停止捕获音频
   * @param {string} sourceId - 音频源 ID
   */
  async stopCapture(sourceId) {
    try {
      console.log(`Stopping audio capture for ${sourceId}`);

      // 停止脚本处理器
      const scriptProcessor = this.scriptProcessors.get(sourceId);
      if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor.onaudioprocess = null;
        this.scriptProcessors.delete(sourceId);
      }

      // 停止音频源
      const sourceNode = this.sourceNodes.get(sourceId);
      if (sourceNode) {
        sourceNode.disconnect();
        this.sourceNodes.delete(sourceId);
      }

      // 停止媒体流
      const stream = this.streams.get(sourceId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        this.streams.delete(sourceId);
      }

      // 清空累积器
      this.audioAccumulators.delete(sourceId);
      this.lastSendTime.delete(sourceId);

      console.log(`Audio capture stopped for ${sourceId}`);

      // 检查是否所有音源都已停止
      if (this.streams.size === 0) {
        this.isCapturing = false;
      }

      return true;
    } catch (error) {
      console.error(`Error stopping audio capture for ${sourceId}:`, error);
      throw error;
    }
  }

  /**
   * 停止所有音频捕获
   */
  async stopAllCaptures() {
    try {
      console.log('Stopping all audio captures');

      const sourceIds = Array.from(this.streams.keys());
      for (const sourceId of sourceIds) {
        await this.stopCapture(sourceId);
      }

      // 关闭音频上下文
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }

      console.log('All audio captures stopped');
      return true;
    } catch (error) {
      console.error('Error stopping all audio captures:', error);
      throw error;
    }
  }

  /**
   * 枚举音频输入设备
   * @returns {Promise<Array>} 设备列表
   */
  async enumerateDevices() {
    try {
      // 请求权限
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // 枚举设备
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `麦克风 ${device.deviceId.substring(0, 8)}`,
          kind: device.kind
        }));

      console.log(`Found ${audioInputs.length} audio input devices`);
      return audioInputs;
    } catch (error) {
      console.error('Error enumerating audio devices:', error);
      throw error;
    }
  }

  /**
   * 获取当前音频捕获状态
   * @returns {Object} 状态信息
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
   * 销毁服务（释放资源）
   */
  destroy() {
    this.stopAllCaptures();
    console.log('AudioCaptureService destroyed');
  }
}

// 导出单例
const audioCaptureService = new AudioCaptureService();
export default audioCaptureService;
