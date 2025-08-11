/**
 * Команды Telegram-бота (доступны только администратору):
 *
 * /start           — приветствие и краткая справка по командам
 * /status          — текущий статус системы, скрапинга и watchdog
 * /restart         — перезапуск основного сервера (через PM2 при наличии, иначе локально)
 * /restartlocal    — локальный перезапуск сервера (kill + spawn node server.js)
 * /restartwatchdog — перезапуск процесса watchdog
 * /logs            — последние строки логов + размеры файлов combined.log и error.log
 * /clearlogs       — очистить файлы логов combined.log и error.log
 * /help            — список доступных команд
 */

import { logger } from '../../src/utils/logger.js';
import { clearLogs, buildLogsSizeText, getRecentLogsText } from './logs.js';

export function setupCommands(monitor) {
  const isAdmin = (ctx) => ctx.from.id.toString() === monitor.chatId;

  monitor.bot.command('start', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.reply('🚀 Бот мониторинга сервера запущен!\n\nКоманды:\n/status - статус сервера\n/restart - перезапуск сервера\n/logs - последние логи\n/help - помощь');
  });

  monitor.bot.command('status', async (ctx) => {
    if (!isAdmin(ctx)) return;
    logger.info('🤖 Пользователь запросил статус сервера');
    const stats = await monitor.getServerStats();
    const message = monitor.formatStatusMessage(stats);
    const sizes = buildLogsSizeText();
    ctx.reply(`${message}\n\n${sizes}`);
  });

  monitor.bot.command('restart', async (ctx) => {
    if (!isAdmin(ctx)) return;
    logger.info('🤖 Пользователь запросил перезапуск сервера');
    ctx.reply('🔄 Перезапуск сервера...');
    await monitor.restartMainServer();
  });

  monitor.bot.command('restartlocal', async (ctx) => {
    if (!isAdmin(ctx)) return;
    logger.info('🤖 Пользователь запросил локальный перезапуск');
    ctx.reply('🔄 Локальный перезапуск сервера...');
    await monitor.restartLocalServer();
  });

  monitor.bot.command('logs', async (ctx) => {
    if (!isAdmin(ctx)) return;
    logger.info('🤖 Пользователь запросил логи');
    const logs = await getRecentLogsText();
    const sizes = buildLogsSizeText();
    ctx.reply(`${sizes}\n\n${logs}`);
  });

  monitor.bot.command('restartwatchdog', async (ctx) => {
    if (!isAdmin(ctx)) return;
    logger.info('🤖 Пользователь запросил перезапуск watchdog');
    await monitor.restartWatchdog(ctx);
  });

  monitor.bot.command('help', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.reply('🤖 Команды бота:\n\n/start - информация о боте\n/status - статус системы\n/restart - перезапуск сервера\n/restartlocal - альтернативный перезапуск\n/restartwatchdog - перезапуск watchdog\n/logs - последние логи\n/clearlogs - очистить логи\n/help - эта справка');
  });

  monitor.bot.command('clearlogs', async (ctx) => {
    if (!isAdmin(ctx)) return;
    logger.info('🧹 Очистка логов по команде');
    const ok = await clearLogs();
    if (ok) {
      ctx.reply('🧹 Логи очищены: combined.log и error.log');
    } else {
      ctx.reply('❌ Не удалось очистить логи');
    }
  });
}


