import { Telegraf } from 'telegraf';
import { logger } from '../src/utils/logger.js';
import { config } from '../src/config/config.js';
import { exec } from 'child_process';
import { setupSchedules } from './monitor/schedules.js';
import { createProcessLock, isProcessLocked, setupProcessLockCleanup } from '../src/utils/procLock.js';
import { setupCommands as setupCommandsModule } from './monitor/commands.js';
import { formatStatusMessage as formatStatusMessageModule } from './monitor/functions.js';
import { getServerStatusFromAPI as apiGetServerStatus, getWatchdogStatusFromAPI as apiGetWatchdogStatus } from './monitor/apiClient.js';
import { createPool, checkDatabaseConnection as dbCheckConnection } from './monitor/db.js';
import { restartLocalServer as psRestartLocal, restartWatchdog as psRestartWatchdog, checkServerRunning as psCheckServerRunning, getServerStartTime as psGetServerStartTime } from './monitor/processService.js';
import { startMonitoring as hmStartMonitoring } from './monitor/healthMonitor.js';
import { sendServerStatus as rptSendStatus, sendDailyReport as rptSendDaily } from './monitor/reports.js';

class TelegramMonitor {
    constructor() {
        // Настройки из переменных окружения или значения по умолчанию
        this.botToken = process.env.TELEGRAM_BOT_TOKEN || '7967034577:AAGhXcdE6ghSvFq_fjSY5oFw-lGJBmb-muE';
        this.chatId = process.env.TELEGRAM_CHAT_ID || '287536885';
        this.statusIntervalHours = parseInt(process.env.TELEGRAM_STATUS_INTERVAL_HOURS) || 8;
        this.monitoringIntervalMinutes = parseInt(process.env.TELEGRAM_MONITORING_INTERVAL_MINUTES) || 3;
        this.dailyReportHour = parseInt(process.env.TELEGRAM_DAILY_REPORT_HOUR) || 10;
        this.bot = null;
        this.mysqlPool = null;
        this.lastStatusSentAt = 0; // защита от дублей статусов
        
        // Состояние мониторинга
        this.lastServerStatus = null; // null, true (работает), false (не работает)
        this.lastDbStatus = null;
        this.lastScrapingCheck = null;
        this.monitoringInterval = null;
        this.serverStartTime = null; // время запуска сервера скрапера
        this.botStartTime = new Date(); // время запуска бота
    }

    async init() {
        try {
            logger.info('🤖 Инициализация Telegram монитора...');
            // Lock: единственный инстанс бота
            if (isProcessLocked('telegram-bot')) {
                logger.error('❌ Обнаружен запущенный экземпляр бота (lock telegram-bot). Выходим.');
                return;
            }
            if (!createProcessLock('telegram-bot')) {
                logger.error('❌ Не удалось создать lock для бота. Выходим.');
                return;
            }
            setupProcessLockCleanup('telegram-bot');
            
            // Создаем бота
            this.bot = new Telegraf(this.botToken);
            
            // Создаем подключение к БД
            this.mysqlPool = createPool();

            // Тестируем подключение к БД
            try {
                await this.mysqlPool.execute('SELECT 1');
                logger.info('✅ Подключение к БД успешно');
            } catch (dbError) {
                logger.warn('⚠️ Не удалось подключиться к БД:', dbError.message);
                logger.info('💡 Это нормально для локального тестирования');
                // Не закрываем пул, просто не используем его
            }

            // Настраиваем команды
            setupCommandsModule(this);

            // Запускаем бота
            await this.bot.launch();
            
            logger.info('✅ Telegram монитор инициализирован');
            await this.sendMessage('🚀 Telegram монитор запущен и готов к работе');

            // Немедленная отправка статуса при старте, чтобы не ждать ближайшего тика cron
            logger.info('⏱️ Немедленная отправка статуса при старте бота');
            await this.sendServerStatus();
            this.lastStatusSentAt = Date.now();

            setupSchedules(this);
            
            // Запускаем мониторинг каждые N минут (вынесенная логика)
            hmStartMonitoring(this);
            
            logger.info(`📅 Cron задачи настроены: статус каждые ${this.statusIntervalHours} часов, ежедневный отчет в ${this.dailyReportHour}:00, мониторинг каждые ${this.monitoringIntervalMinutes} минут`);

        } catch (error) {
            logger.error('❌ Ошибка инициализации Telegram монитора:', error);
        }
    }

    setupCommands() { setupCommandsModule(this); }

        async getServerStats() {
        try {
            // Получаем статус сервера через API endpoint
            const serverStatus = await this.getServerStatusFromAPI();
            const watchdogStatus = await this.getWatchdogStatusFromAPI();
            const dbConnected = await this.checkDatabaseConnection();
            
            // Получаем статистику скрапинга из API вместо БД
            const scrapingStats = serverStatus.data && serverStatus.data.stats ? serverStatus.data.stats : null;
            
            return {
                serverRunning: serverStatus.running,
                dbConnected,
                scrapingStats,
                serverStartTime: serverStatus.startTime,
                uptime: serverStatus.uptime,
                serverData: serverStatus.data,
                watchdogStatus: watchdogStatus
            };
        } catch (error) {
            logger.error('❌ Ошибка получения статистики сервера:', error.message);
            return {
                serverRunning: false,
                dbConnected: false,
                scrapingStats: null,
                serverStartTime: null,
                uptime: 0,
                serverData: null,
                watchdogStatus: null
            };
        }
    }

    async getServerStatusFromAPI() { return await apiGetServerStatus(); }

    async getWatchdogStatusFromAPI() { return await apiGetWatchdogStatus(); }



    formatUptime(minutes) { return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`; }

    formatStatusMessage(stats) { return formatStatusMessageModule(this, stats); }

    async sendServerStatus() { return await rptSendStatus(this); }

    async restartMainServer() {
        return new Promise((resolve) => {
            // Сначала проверяем, есть ли PM2
            exec('pm2 --version', (pm2Error) => {
                if (pm2Error) {
                    logger.warn('⚠️ PM2 не найден, используем обычный перезапуск');
                    this.sendMessage('⚠️ PM2 не найден, перезапускаем сервер напрямую...');
                    
                    // Если PM2 нет, используем ту же логику что и restartLocalServer
                    this.restartLocalServer().then(() => {
                        resolve();
                    });
                    return;
                }
                
                // Если PM2 есть, перезапускаем через PM2
                exec('pm2 restart winamax-scraper', (error, stdout, stderr) => {
                    if (error) {
                        logger.error('❌ Ошибка перезапуска через PM2:', error);
                        logger.warn('⚠️ Пробуем обычный перезапуск...');
                        this.sendMessage('❌ Ошибка PM2, пробуем обычный перезапуск...');
                        
                        // Если PM2 не сработал, используем restartLocalServer
                        this.restartLocalServer().then(() => {
                            resolve();
                        });
                    } else {
                        logger.info('✅ Сервер перезапущен через PM2');
                        this.sendMessage('✅ Сервер успешно перезапущен через PM2');
                        resolve();
                    }
                });
            });
        });
    }

    async restartLocalServer() { await psRestartLocal((m) => this.sendMessage(m)); }

    async restartWatchdog(ctx) { await psRestartWatchdog(ctx); }

    async getRecentLogs() { /* перенесено в logs.js и используется через команды */ }

    async sendMessage(message) { await this.bot.telegram.sendMessage(this.chatId, message); }

    startMonitoring() { /* перенесено в healthMonitor.js */ }

    async checkSystemStatus() { /* перенесено в healthMonitor.js */ }

    async checkServerRunning() { return await psCheckServerRunning(); }

    async getServerStartTime() { return await psGetServerStartTime(); }

    async checkDatabaseConnection() { return await dbCheckConnection(this.mysqlPool); }

    async checkScrapingErrors() { /* перенесено в healthMonitor.js */ }

    async sendDailyReport() { return await rptSendDaily(this); }

    async stop() {
        try {
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
                logger.info('🛑 Мониторинг остановлен');
            }
            if (this.bot) {
                await this.bot.stop();
                logger.info('🛑 Telegram бот остановлен');
            }
            if (this.mysqlPool) {
                await this.mysqlPool.end();
                logger.info('🛑 Подключение к БД закрыто');
            }
        } catch (error) {
            logger.error('❌ Ошибка остановки Telegram монитора:', error);
        }
    }
}

// Создаем и запускаем монитор
const monitor = new TelegramMonitor();

// Обработка graceful shutdown
process.on('SIGINT', async () => {
    logger.info('🛑 Получен сигнал SIGINT, останавливаем Telegram монитор...');
    await monitor.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('🛑 Получен сигнал SIGTERM, останавливаем Telegram монитор...');
    await monitor.stop();
    process.exit(0);
});

// Запускаем монитор
monitor.init().catch(error => {
    logger.error('❌ Ошибка запуска Telegram монитора:', error);
    process.exit(1);
}); 