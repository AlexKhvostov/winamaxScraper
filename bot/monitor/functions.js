import { logger } from '../../src/utils/logger.js';

export function formatUptime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}ч ${mins}м`;
  }
  return `${mins}м`;
}

export function formatStatusMessage(monitor, stats) {
  const now = new Date();
  const botUptimeMs = now - monitor.botStartTime;
  const botUptimeMinutes = Math.floor(botUptimeMs / (1000 * 60));

  logger.debug(`🕐 Время работы бота: ${botUptimeMinutes} минут (${botUptimeMs} мс)`);
  logger.debug(`🕐 Время запуска бота: ${monitor.botStartTime}`);
  logger.debug(`🕐 Текущее время: ${now}`);

  let serverUptimeMinutes = 0;
  let serverInfo = `• Статус: ${stats.serverRunning ? '✅ Запущен' : '❌ Не запущен'}`;

  if (stats.serverStartTime) {
    const diffMs = now - stats.serverStartTime;
    serverUptimeMinutes = Math.floor(diffMs / (1000 * 60));

    serverInfo += `\n• Время работы: ${formatUptime(serverUptimeMinutes)}`;
    serverInfo += `\n• Запущен: ${stats.serverStartTime.toLocaleString('ru-RU', { timeZone: 'Europe/Rome' })}`;
  }

  const scraping = stats.scrapingStats || {};
  const lastRun = stats.serverStartTime ?
    stats.serverStartTime.toLocaleString('ru-RU', { timeZone: 'Europe/Rome' }) :
    'Нет данных';

  let watchdogInfo = '• Статус: ❌ Недоступен';
  if (stats.watchdogStatus) {
    const watchdog = stats.watchdogStatus;
    const watchdogUptimeMinutes = Math.floor(watchdog.uptime / 60);
    watchdogInfo = `• Статус: ${watchdog.isRunning ? '✅ Работает' : '❌ Остановлен'}\n` +
      `• Время работы: ${formatUptime(watchdogUptimeMinutes)}\n` +
      `• Последняя проверка: ${watchdog.lastCheckTime ? new Date(watchdog.lastCheckTime).toLocaleString('ru-RU', { timeZone: 'Europe/Rome' }) : 'Нет данных'}\n` +
      `• Перезапусков: ${watchdog.restartCount}`;
  }

  return `📊 **Статус сервера**

🗄️ **База данных:**
• Статус: ${stats.dbConnected ? '✅ Подключено' : '❌ Нет подключения'}

🐕 **Watchdog:**
${watchdogInfo}

🖥️ **Система (бот):**
• Статус: ✅ Запущен
• Время работы: ${formatUptime(botUptimeMinutes)}
• Память: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
• Платформа: ${process.platform}
• Node.js: ${process.version}

🚀 **Сервер скрапера:**
${serverInfo}


📈 **Скрапинг (из API):**
• Всего запусков: ${scraping.totalRuns || 0}
• Успешных: ${scraping.successfulRuns || 0}
• Ошибок: ${scraping.failedRuns || 0}
• Последняя ошибка: ${scraping.lastError || 'Нет'}
• Последний запуск: ${lastRun}

⏰ Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Rome' })}`;
}


