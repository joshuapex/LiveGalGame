// 安全的日志工具模块，避免 EPIPE 错误
// 用于 Electron 主进程，当 stdout/stderr 不可用时不会崩溃

/**
 * 安全的日志函数，避免 EPIPE 错误
 * @param {...any} args - 要输出的参数
 */
function safeLog(...args) {
  try {
    console.log(...args);
  } catch (error) {
    // 忽略 EPIPE 错误（stdout 关闭时）
    if (error.code !== 'EPIPE' && !error.message?.includes('EPIPE')) {
      // 如果不是 EPIPE 错误，尝试其他方式记录
      try {
        console.error('Log error:', error);
      } catch (e) {
        // 如果连 console.error 也失败，就忽略
      }
    }
  }
}

/**
 * 安全的错误日志函数，避免 EPIPE 错误
 * @param {...any} args - 要输出的参数
 */
function safeError(...args) {
  try {
    console.error(...args);
  } catch (error) {
    // 忽略 EPIPE 错误（stderr 关闭时）
    if (error.code !== 'EPIPE' && !error.message?.includes('EPIPE')) {
      // 如果不是 EPIPE 错误，尝试其他方式记录
      try {
        // 尝试写入文件或其他方式（未来可以扩展）
      } catch (e) {
        // 忽略所有错误
      }
    }
  }
}

/**
 * 安全的警告日志函数，避免 EPIPE 错误
 * @param {...any} args - 要输出的参数
 */
function safeWarn(...args) {
  try {
    console.warn(...args);
  } catch (error) {
    // 忽略 EPIPE 错误（stderr 关闭时）
    if (error.code !== 'EPIPE' && !error.message?.includes('EPIPE')) {
      // 如果不是 EPIPE 错误，尝试其他方式记录
      try {
        // 尝试写入文件或其他方式（未来可以扩展）
      } catch (e) {
        // 忽略所有错误
      }
    }
  }
}

/**
 * 安全的信息日志函数，避免 EPIPE 错误
 * @param {...any} args - 要输出的参数
 */
function safeInfo(...args) {
  try {
    console.info(...args);
  } catch (error) {
    // 忽略 EPIPE 错误
    if (error.code !== 'EPIPE' && !error.message?.includes('EPIPE')) {
      // 忽略其他错误
    }
  }
}

/**
 * 安全的调试日志函数，避免 EPIPE 错误
 * @param {...any} args - 要输出的参数
 */
function safeDebug(...args) {
  try {
    console.debug(...args);
  } catch (error) {
    // 忽略 EPIPE 错误
    if (error.code !== 'EPIPE' && !error.message?.includes('EPIPE')) {
      // 忽略其他错误
    }
  }
}

export {
  safeLog as log,
  safeError as error,
  safeWarn as warn,
  safeInfo as info,
  safeDebug as debug
};







