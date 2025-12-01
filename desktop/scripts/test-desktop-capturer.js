/**
 * 快速测试 desktopCapturer API
 * 检查是否能获取系统音频
 */

import { desktopCapturer, app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

async function testDesktopCapturer() {
  console.log('开始测试 desktopCapturer API...\n');

  try {
    // 获取屏幕源
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false
    });

    console.log(`找到 ${sources.length} 个屏幕源:\n`);
    sources.forEach((source, index) => {
      console.log(`源 ${index + 1}:`);
      console.log(`  ID: ${source.id}`);
      console.log(`  Name: ${source.name}`);
      console.log(`  Thumbnail: ${source.thumbnail ? '有' : '无'}`);
      console.log('');
    });

    if (sources.length === 0) {
      console.log('❌ 没有找到屏幕源');
      return false;
    }

    console.log('✅ desktopCapturer.getSources() 调用成功\n');
    
    // 在渲染进程中测试实际的音频捕获
    if (mainWindow) {
      console.log('在渲染进程中测试音频捕获...\n');
      
      const testCode = `
        (async () => {
          try {
            if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error('navigator.mediaDevices.getUserMedia 不可用');
            }
            
            const sourceId = '${sources[0].id}';
            console.log('尝试获取音频流，sourceId:', sourceId);
            
            const stream = await navigator.mediaDevices.getUserMedia({
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
            
            const audioTracks = stream.getAudioTracks();
            const videoTracks = stream.getVideoTracks();
            
            console.log('✅ 成功获取媒体流!');
            console.log('音频轨道数:', audioTracks.length);
            console.log('视频轨道数:', videoTracks.length);
            
            if (audioTracks.length > 0) {
              audioTracks.forEach((track, i) => {
                console.log(\`音频轨道 \${i + 1}: enabled=\${track.enabled}, muted=\${track.muted}, readyState=\${track.readyState}\`);
              });
              
              // 测试音频处理
              const audioContext = new AudioContext({ sampleRate: 16000 });
              const sourceNode = audioContext.createMediaStreamSource(stream);
              const analyser = audioContext.createAnalyser();
              analyser.fftSize = 256;
              sourceNode.connect(analyser);
              
              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              let sampleCount = 0;
              
              const checkInterval = setInterval(() => {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                sampleCount++;
                
                if (sampleCount % 10 === 0) {
                  console.log(\`音频采样 #\${sampleCount}: 平均音量=\${average.toFixed(2)}\`);
                }
                
                if (average > 10) {
                  console.log(\`✅ 检测到音频活动! 平均音量: \${average.toFixed(2)}\`);
                }
              }, 100);
              
              setTimeout(() => {
                clearInterval(checkInterval);
                stream.getTracks().forEach(track => track.stop());
                audioContext.close();
                console.log('测试完成');
                window.testResult = { success: true, message: '系统音频捕获测试成功' };
              }, 5000);
              
            } else {
              console.log('⚠️ 警告: 没有音频轨道，可能不支持系统音频捕获');
              stream.getTracks().forEach(track => track.stop());
              window.testResult = { success: false, message: '没有音频轨道' };
            }
            
          } catch (error) {
            console.error('❌ 错误:', error.message);
            window.testResult = { success: false, message: error.message };
          }
        })();
      `;
      
      await mainWindow.webContents.executeJavaScript(testCode);
      
      // 等待测试完成
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      const result = await mainWindow.webContents.executeJavaScript('window.testResult || null');
      if (result) {
        if (result.success) {
          console.log('✅', result.message);
        } else {
          console.log('❌', result.message);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ 错误:', error.message || error);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head><title>Desktop Capturer Test</title></head>
    <body>
      <h1>Desktop Capturer 测试</h1>
      <p>检查控制台输出...</p>
      <script>
        console.log('渲染进程已加载');
      </script>
    </body>
    </html>
  `));

  mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  createWindow();
  
  // 等待窗口加载完成
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const success = await testDesktopCapturer();
  
  setTimeout(() => {
    app.quit();
  }, 2000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

