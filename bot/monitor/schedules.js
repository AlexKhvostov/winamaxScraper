import cron from 'node-cron';
import { logger } from '../../src/utils/logger.js';
import { clearLogs } from './logs.js';

export function setupSchedules(monitor) {
  // ЕЖЕЧАСНЫЙ СТАТУС ПЕРЕНЕСЕН НА СЕРВЕР (fallback).
  // В боте отключаем планирование периодической отправки статуса.

  // Ежедневный отчет
  cron.schedule(`0 ${monitor.dailyReportHour} * * *`, async () => {
    logger.info(`📊 Отправка ежедневного отчета в ${monitor.dailyReportHour}:00 по Милану`);
    await monitor.sendDailyReport();
  }, { timezone: 'Europe/Rome' });

  // Автоочистка логов по CRON (если включена в конфиге)
  if (process.env.LOGS_AUTO_CLEAR_CRON) {
    const expr = process.env.LOGS_AUTO_CLEAR_CRON;
    logger.info(`🧹 Включена автоочистка логов по расписанию: ${expr}`);
    cron.schedule(expr, async () => {
      logger.info('🧹 Автоочистка логов по расписанию');
      await clearLogs();
    }, { timezone: 'Europe/Rome' });
  } else if (process.env.LOGS_AUTO_CLEAR_HOUR) {
    const hour = parseInt(process.env.LOGS_AUTO_CLEAR_HOUR, 10);
    if (!Number.isNaN(hour) && hour >= 0 && hour <= 23) {
      const expr = `0 ${hour} * * *`;
      logger.info(`🧹 Включена автоочистка логов по часу: ${hour}:00 (cron: ${expr})`);
      cron.schedule(expr, async () => {
        logger.info('🧹 Автоочистка логов по расписанию (hour)');
        await clearLogs();
      }, { timezone: 'Europe/Rome' });
    } else {
      logger.warn('⚠️ Некорректное значение LOGS_AUTO_CLEAR_HOUR, ожидается 0-23');
    }
  }
}


