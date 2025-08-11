import { logger } from '../../src/utils/logger.js';
import { sendMessage } from './messaging.js';
import { buildLogsSizeText } from './logs.js';

export async function sendServerStatus(monitor) {
  try {
    const stats = await monitor.getServerStats();
    const message = monitor.formatStatusMessage(stats);
    const logsText = buildLogsSizeText();
    await sendMessage(monitor.bot, monitor.chatId, `${message}\n\n${logsText}`);
    logger.info('✅ Статус сервера отправлен в Telegram');
  } catch (error) {
    logger.error('❌ Ошибка отправки статуса сервера:', error);
    await sendMessage(monitor.bot, monitor.chatId, '❌ Ошибка отправки статуса сервера');
  }
}

export async function sendDailyReport(monitor) {
  try {
    const stats = await monitor.getServerStats();
    const scraping = stats.scrapingStats || {};
    const successRate = scraping.totalRuns > 0 ? ((scraping.successfulRuns / scraping.totalRuns) * 100).toFixed(1) : '0';
    const report = `📊 **Ежедневный отчет - ${new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Rome' })}**

🚀 **Статус системы:**
• Сервер: ${stats.serverRunning ? '✅ Работает' : '❌ Не работает'}
• База данных: ${stats.dbConnected ? '✅ Подключено' : '❌ Нет подключения'}

📈 **Статистика скрапинга (из API):**
• Всего запусков: ${scraping.totalRuns || 0}
• Успешных: ${scraping.successfulRuns || 0}
• Ошибок: ${scraping.failedRuns || 0}
• Успешность: ${successRate}%
• Последняя ошибка: ${scraping.lastError || 'Нет'}

⏰ Отчет сгенерирован: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Rome' })}`;
    const logsText = buildLogsSizeText();
    await sendMessage(monitor.bot, monitor.chatId, `${report}\n\n${logsText}`);
    logger.info('📊 Ежедневный отчет отправлен');
  } catch (error) {
    logger.error('❌ Ошибка отправки ежедневного отчета:', error);
    await sendMessage(monitor.bot, monitor.chatId, '❌ Ошибка генерации ежедневного отчета');
  }
}


