import ASRService from './asr-service.js';

export async function createWhisperService() {
  return new ASRService();
}

export default createWhisperService;