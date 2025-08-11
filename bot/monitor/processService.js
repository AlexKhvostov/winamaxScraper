import { exec, spawn } from 'child_process';
import { logger } from '../../src/utils/logger.js';

export function checkServerRunning() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('wmic process where "commandline like \'%server.js%\'" get commandline', (error, stdout) => {
        if (!error && stdout.trim()) {
          const lines = stdout.trim().split('\n');
          const hasRealProcess = lines.some(line => {
            const s = line.trim();
            const isNode = /(^|\\|\s)node(\.exe)?(\s|\"|$)/i.test(s);
            return isNode && s.includes('server.js') && !s.includes('CommandLine') && !s.includes('wmic');
          });
          resolve(hasRealProcess);
        } else {
          resolve(false);
        }
      });
    } else {
      exec('ps aux | grep "server.js" | grep -v grep', (error, stdout) => resolve(!error && stdout.trim()));
    }
  });
}

export function getServerStartTime() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec('wmic process where "commandline like \'%server.js%\'" get CreationDate,ProcessId', (error, stdout) => {
        if (!error && stdout.includes('CreationDate')) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            if (line.includes('.') && /\d/.test(line)) {
              const m = line.match(/(\d{14})/);
              if (m) {
                const d = m[1];
                const startTime = new Date(
                  parseInt(d.substring(0,4)),
                  parseInt(d.substring(4,6)) - 1,
                  parseInt(d.substring(6,8)),
                  parseInt(d.substring(8,10)),
                  parseInt(d.substring(10,12)),
                  parseInt(d.substring(12,14))
                );
                resolve(startTime); return;
              }
            }
          }
        }
        resolve(null);
      });
    } else {
      exec('ps -o lstart,pid,cmd | grep "server.js" | grep -v grep', (error, stdout) => {
        if (!error && stdout.trim()) {
          const lines = stdout.trim().split('\n');
          if (lines.length > 0) {
            const startTimeStr = lines[0].substring(0, 24).trim();
            const startTime = new Date(startTimeStr);
            resolve(isNaN(startTime.getTime()) ? null : startTime); return;
          }
        }
        resolve(null);
      });
    }
  });
}

export async function restartLocalServer(sendMessage) {
  const isRunning = await checkServerRunning();
  if (!isRunning) {
    logger.warn('⚠️ Не найден процесс сервера скрапера, запускаем...');
    sendMessage && sendMessage('🔄 Сервер не запущен, запускаем...');
    const serverProcess = spawn('node', ['server.js'], { detached: true, stdio: 'ignore' });
    serverProcess.unref();
    setTimeout(() => { logger.info('✅ Сервер скрапера запущен'); sendMessage && sendMessage('✅ Сервер скрапера успешно запущен'); }, 1000);
    return;
  }

  return new Promise((resolve) => {
    const findCmd = process.platform === 'win32' ? 'wmic process where "commandline like \'%server.js%\'" get processid' : 'ps aux | grep "server.js" | grep -v grep';
    exec(findCmd, (error, stdout) => {
      let serverPid = null;
      if (!error && stdout.trim()) {
        if (process.platform === 'win32') {
          const pids = stdout.trim().split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s));
          if (pids.length > 0) serverPid = pids[0];
        } else {
          const m = stdout.trim().split('\n')[0].match(/\s+(\d+)\s+/); if (m) serverPid = m[1];
        }
      }
      if (!serverPid) { logger.warn('⚠️ Не удалось найти PID сервера'); sendMessage && sendMessage('⚠️ Не удалось найти PID сервера'); resolve(); return; }
      logger.info(`🔄 Останавливаем сервер скрапера (PID: ${serverPid})`);
      const killCmd = process.platform === 'win32' ? `taskkill /F /PID ${serverPid}` : `kill ${serverPid}`;
      exec(killCmd, () => {
        setTimeout(() => {
          const serverProcess = spawn('node', ['server.js'], { detached: true, stdio: 'ignore' });
          serverProcess.unref();
          setTimeout(() => { logger.info('✅ Сервер скрапера запущен'); sendMessage && sendMessage('✅ Сервер скрапера успешно перезапущен'); resolve(); }, 1000);
        }, 2000);
      });
    });
  });
}

export function restartWatchdog(ctx) {
  return new Promise((resolve) => {
    logger.info('🔄 Перезапуск watchdog...');
    ctx && ctx.reply && ctx.reply('🔄 Перезапуск watchdog...');
    const findPidCommand = process.platform === 'win32'
      ? 'wmic process where "commandline like \'%watchdog.js%\'" get processid'
      : "ps aux | grep 'watchdog.js' | grep -v grep | awk '{print $2}'";

    exec(findPidCommand, (error, stdout) => {
      if (error || !stdout.trim()) {
        logger.warn('⚠️ Не удалось найти PID watchdog');
        ctx && ctx.reply && ctx.reply('❌ Не удалось найти процесс watchdog');
        resolve();
        return;
      }
      const lines = stdout.split('\n').filter(line => line.trim().match(/^\d+$/));
      if (lines.length === 0) {
        logger.warn('⚠️ Не найден PID watchdog в выводе команды');
        ctx && ctx.reply && ctx.reply('❌ Не найден PID watchdog');
        resolve();
        return;
      }
      const pid = lines[0].trim();
      logger.info(`🔄 Убиваем процесс watchdog (PID: ${pid})`);
      const killCommand = process.platform === 'win32' ? `taskkill /F /PID ${pid}` : `kill ${pid}`;
      exec(killCommand, (killError) => {
        if (killError) {
          logger.error('❌ Ошибка убийства процесса watchdog:', killError.message);
          ctx && ctx.reply && ctx.reply('❌ Ошибка остановки watchdog');
          resolve();
          return;
        }
        logger.info('✅ Процесс watchdog остановлен');
        setTimeout(() => {
          const watchdogProcess = spawn('node', ['watchdog.js', 'start'], { detached: true, stdio: 'ignore' });
          watchdogProcess.unref();
          logger.info('✅ Watchdog перезапущен');
          ctx && ctx.reply && ctx.reply('✅ Watchdog успешно перезапущен');
          resolve();
        }, 2000);
      });
    });
  });
}


