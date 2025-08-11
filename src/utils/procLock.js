import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

function getLockPath(name) {
  return path.join(process.cwd(), `${name}.lock`);
}

export function isProcessLocked(name) {
  const lockPath = getLockPath(name);
  try {
    if (!fs.existsSync(lockPath)) return false;
    const raw = fs.readFileSync(lockPath, 'utf8');
    const data = JSON.parse(raw);
    const pid = data?.pid;
    if (!pid) { fs.unlinkSync(lockPath); return false; }
    try {
      process.kill(pid, 0);
      return true; // процесс с таким PID жив
    } catch {
      // процесса нет — удаляем устаревший lock
      fs.unlinkSync(lockPath);
      return false;
    }
  } catch (e) {
    logger.warn(`⚠️ Проблема с lock-файлом ${lockPath}: ${e.message}`);
    return false;
  }
}

export function createProcessLock(name) {
  const lockPath = getLockPath(name);
  if (isProcessLocked(name)) {
    return false;
  }
  try {
    const data = { pid: process.pid, startTime: new Date().toISOString(), argv: process.argv.join(' ') };
    fs.writeFileSync(lockPath, JSON.stringify(data, null, 2));
    logger.info(`🔒 Создан lock-файл ${path.basename(lockPath)} (PID ${process.pid})`);
    return true;
  } catch (e) {
    logger.error(`❌ Не удалось создать lock-файл ${lockPath}: ${e.message}`);
    return false;
  }
}

export function removeProcessLock(name) {
  const lockPath = getLockPath(name);
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
      logger.info(`🔓 Удалён lock-файл ${path.basename(lockPath)}`);
    }
  } catch (e) {
    logger.warn(`⚠️ Не удалось удалить lock-файл ${lockPath}: ${e.message}`);
  }
}

export function setupProcessLockCleanup(name) {
  const cleanup = () => removeProcessLock(name);
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('uncaughtException', (err) => { logger.error('Необработанная ошибка:', err); cleanup(); process.exit(1); });
}


