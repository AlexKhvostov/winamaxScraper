import fetch from 'node-fetch';
import { logger } from '../../src/utils/logger.js';

export async function getServerStatusFromAPI() {
  try {
    const response = await fetch('http://localhost:3000/api/status', { timeout: 10000 });
    if (!response.ok) {
      logger.warn(`⚠️ Сервер недоступен (HTTP ${response.status})`);
      return { running: false, startTime: null, uptime: 0, data: null };
    }
    const data = await response.json();
    if (data.status !== 'running') {
      logger.warn(`⚠️ Сервер не работает (статус: ${data.status})`);
      return { running: false, startTime: null, uptime: 0, data: null };
    }
    return {
      running: true,
      startTime: data.serverStartTime ? new Date(data.serverStartTime) : null,
      uptime: data.uptime || 0,
      data
    };
  } catch (error) {
    logger.warn(`⚠️ Ошибка подключения к серверу: ${error.message}`);
    return { running: false, startTime: null, uptime: 0, data: null };
  }
}

export async function getWatchdogStatusFromAPI() {
  try {
    const response = await fetch('http://localhost:3001/api/status', { timeout: 5000 });
    if (!response.ok) {
      logger.warn(`⚠️ Watchdog недоступен (HTTP ${response.status})`);
      return null;
    }
    return await response.json();
  } catch (error) {
    logger.warn(`⚠️ Ошибка подключения к watchdog: ${error.message}`);
    return null;
  }
}


