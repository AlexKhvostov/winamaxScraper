import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { logger } from '../../src/utils/logger.js';

const logsDir = 'logs';
const combinedPath = path.join(logsDir, 'combined.log');
const errorPath = path.join(logsDir, 'error.log');

function getTodayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getTodayRotatedPaths() {
  const date = getTodayDateStr();
  return {
    combined: path.join(logsDir, `combined-${date}.log`),
    error: path.join(logsDir, `error-${date}.log`),
    date
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${sizes[i]}`;
}

export function getLogSizes() {
  try {
    const { combined, error, date } = getTodayRotatedPaths();
    const combinedSize = fs.existsSync(combined)
      ? fs.statSync(combined).size
      : (fs.existsSync(combinedPath) ? fs.statSync(combinedPath).size : 0);
    const errorSize = fs.existsSync(error)
      ? fs.statSync(error).size
      : (fs.existsSync(errorPath) ? fs.statSync(errorPath).size : 0);
    return {
      combined: { bytes: combinedSize, formatted: formatBytes(combinedSize) },
      error: { bytes: errorSize, formatted: formatBytes(errorSize) },
      date
    };
  } catch (e) {
    logger.warn('⚠️ Не удалось получить размер логов:', e.message);
    return { combined: { bytes: 0, formatted: '0 B' }, error: { bytes: 0, formatted: '0 B' }, date: getTodayDateStr() };
  }
}

export function buildLogsSizeText() {
  const sizes = getLogSizes();
  return `🗂️ Логи (за ${sizes.date}):\n• combined: ${sizes.combined.formatted}\n• error: ${sizes.error.formatted}`;
}

export async function clearLogs() {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    // truncate or create empty files (legacy)
    fs.writeFileSync(combinedPath, '');
    fs.writeFileSync(errorPath, '');
    // also today's rotated
    const { combined, error } = getTodayRotatedPaths();
    try { fs.writeFileSync(combined, ''); } catch {}
    try { fs.writeFileSync(error, ''); } catch {}
    logger.info('🧹 Логи очищены: текущие и legacy (combined/error)');
    return true;
  } catch (e) {
    logger.error('❌ Ошибка очистки логов:', e.message);
    return false;
  }
}

export function getRecentLogsText() {
  return new Promise((resolve) => {
    // Сначала проверяем, есть ли PM2
    exec('pm2 --version', (pm2Error) => {
      if (pm2Error) {
        logger.warn('⚠️ PM2 не найден, показываем информацию о процессе');
        const { combined, error } = getTodayRotatedPaths();
        const filesToRead = [error, combined, errorPath, combinedPath].filter(p => {
          try { return fs.existsSync(p); } catch { return false; }
        });
        const readLastLines = (p, maxLines = 40) => {
          try {
            const data = fs.readFileSync(p, 'utf8');
            const lines = data.split(/\r?\n/);
            const tail = lines.slice(-maxLines).join('\n');
            return `--- ${path.basename(p)} ---\n${tail}`;
          } catch { return ''; }
        };
        const parts = filesToRead.map(p => readLastLines(p, 30)).filter(Boolean);
        let processInfo = `📋 **Информация о процессе:**\n\n🖥️ **Процесс Node.js:**\n• PID: ${process.pid}\n• Память: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n• Время работы: ${Math.floor(process.uptime() / 3600)}ч ${Math.floor((process.uptime() % 3600) / 60)}м\n• Платформа: ${process.platform}\n\n📁 **Файлы логов (с ротацией):**\n• logs/combined-YYYY-MM-DD.log\n• logs/error-YYYY-MM-DD.log`;
        if (parts.length) {
          const body = parts.join('\n\n');
          processInfo += `\n\n📋 **Последние логи:**\n\n${body.substring(0, 2000)}`;
        }
        processInfo += '\n\n💡 **На сервере используйте:** pm2 logs winamax-scraper --lines 10';
        resolve(processInfo);
        return;
      }
      exec('pm2 logs winamax-scraper --lines 10', (error, stdout) => {
        if (error) {
          logger.error('❌ Ошибка получения логов:', error);
          resolve('❌ Ошибка получения логов');
        } else {
          resolve(`📋 **Последние логи:**\n\n${stdout || 'Нет логов'}`);
        }
      });
    });
  });
}


