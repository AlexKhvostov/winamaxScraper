import { logger } from '../../src/utils/logger.js';
import { checkServerRunning, getServerStartTime } from './processService.js';

export function startMonitoring(monitor) {
  monitor.monitoringInterval = setInterval(async () => {
    await checkSystemStatus(monitor);
  }, monitor.monitoringIntervalMinutes * 60 * 1000);
  logger.info(`🔄 Мониторинг запущен: проверка каждые ${monitor.monitoringIntervalMinutes} минут`);
}

export async function checkSystemStatus(monitor) {
  try {
    logger.debug('🔍 Проверка статуса системы...');

    const isServerRunning = await checkServerRunning();
    const isDbConnected = await monitor.checkDatabaseConnection();

    if (monitor.lastServerStatus !== null && monitor.lastServerStatus !== isServerRunning) {
      if (isServerRunning) {
        monitor.serverStartTime = new Date();
        await monitor.sendMessage('✅ **Сервер скрапера восстановлен!**\n\n🚀 Сервер снова работает\n⏰ Время восстановления: ' + monitor.serverStartTime.toLocaleString('ru-RU', { timeZone: 'Europe/Rome' }));
        logger.info('✅ Сервер восстановлен, уведомление отправлено');
      } else {
        monitor.serverStartTime = null;
        await monitor.sendMessage('🚨 **ВНИМАНИЕ: Сервер скрапера упал!**\n\n❌ Сервер не отвечает\n⏰ Время: ' + new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Rome' }));
        logger.warn('🚨 Сервер упал, уведомление отправлено');
      }
    }

    if (isServerRunning && !monitor.serverStartTime) {
      const realStartTime = await getServerStartTime();
      monitor.serverStartTime = realStartTime || new Date();
    }

    if (monitor.lastDbStatus !== null && monitor.lastDbStatus !== isDbConnected) {
      if (isDbConnected) {
        await monitor.sendMessage('✅ **База данных восстановлена!**\n\n🗄️ Подключение к БД восстановлено');
      } else {
        await monitor.sendMessage('🚨 **ВНИМАНИЕ: Потеряно соединение с БД!**\n\n❌ Нет подключения к базе данных\n⏰ Время: ' + new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Rome' }));
      }
    }

    await checkScrapingErrors(monitor);

    monitor.lastServerStatus = isServerRunning;
    monitor.lastDbStatus = isDbConnected;

  } catch (error) {
    logger.error('❌ Ошибка проверки статуса системы:', error);
  }
}

export async function checkScrapingErrors(monitor) {
  try {
    if (!monitor.mysqlPool) return;

    const [recentLogs] = await monitor.mysqlPool.execute(`
      SELECT * FROM scraping_logs 
      ORDER BY created_at DESC 
      LIMIT 3
    `);

    if (recentLogs.length === 0) return;

    const lastLog = recentLogs[0];
    const logTime = new Date(lastLog.created_at);
    const now = new Date();
    const diffMinutes = (now - logTime) / (1000 * 60);

    if (diffMinutes > 15) {
      if (!monitor.lastScrapingCheck || (now - monitor.lastScrapingCheck) > 30 * 60 * 1000) {
        await monitor.sendMessage(`⚠️ **Скрапинг не выполнялся долгое время**\n\n⏰ Последний запуск: ${Math.round(diffMinutes)} минут назад\n📅 Время: ${logTime.toLocaleString('ru-RU', { timeZone: 'Europe/Rome' })}`);
        monitor.lastScrapingCheck = now;
      }
    }

    if (lastLog.players_found === 0 && lastLog.database_success === 1) {
      const errorTime = logTime.toLocaleString('ru-RU', { timeZone: 'Europe/Rome' });
      await monitor.sendMessage(`⚠️ **Скрапинг нашел 0 игроков**\n\n🎯 Лимит: ${lastLog.limit_value}\n⏰ Время: ${errorTime}\n\n💡 Возможно, проблема с сайтом или фильтрами`);
      logger.warn(`⚠️ Скрапинг нашел 0 игроков для лимита ${lastLog.limit_value}`);
    }

  } catch (error) {
    logger.error('❌ Ошибка проверки скрапинга:', error);
  }
}


