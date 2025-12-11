import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const PCM_SAMPLE_RATE = 16000;

export function float32ToInt16Buffer(floatArray) {
  const int16Array = new Int16Array(floatArray.length);
  for (let i = 0; i < floatArray.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, floatArray[i]));
    int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return Buffer.from(int16Array.buffer);
}

export function ensureDir(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

export function createWavBuffer(audioData) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = audioData.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  buffer.writeUInt32LE(PCM_SAMPLE_RATE * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < audioData.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  return buffer;
}

export function defaultAudioStoragePath() {
  return path.join(app.getPath('temp'), 'asr');
}

