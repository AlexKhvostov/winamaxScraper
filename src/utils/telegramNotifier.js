/**
 * Модуль для отправки Telegram уведомлений
 * Использует BOT_TOKEN и CHAT_ID из .env файла
 */

import { logger } from './logger.js';

class TelegramNotifier {
    constructor() {
        this.botToken = process.env.BOT_TOKEN;
        this.chatId = process.env.CHAT_ID;
        this.isEnabled = this.botToken && this.chatId;
        
        if (this.isEnabled) {
            logger.info('📱 Telegram уведомления включены');
        } else {
            logger.warn('📱 Telegram уведомления отключены (отсутствуют BOT_TOKEN или CHAT_ID)');
        }
    }

    /**
     * Отправляет сообщение в Telegram
     * @param {string} message - текст сообщения
     * @param {boolean} isError - является ли сообщение ошибкой
     */
    async sendMessage(message, isError = false) {
        if (!this.isEnabled) {
            return;
        }

        try {
            const emoji = isError ? '🚨' : 'ℹ️';
            const formattedMessage = `${emoji} **Winamax Scraper**\n\n${message}`;
            
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: formattedMessage,
                    parse_mode: 'Markdown'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                logger.error('Ошибка отправки Telegram уведомления:', errorData);
            } else {
                logger.debug('Telegram уведомление отправлено успешно');
            }
        } catch (error) {
            logger.error('Ошибка отправки Telegram уведомления:', error);
        }
    }

    /**
     * Отправляет уведомление об ошибке скрапера
     * @param {string} errorMessage - сообщение об ошибке
     * @param {string} limit - лимит турнира (опционально)
     */
    async sendScrapingError(errorMessage, limit = null) {
        const limitInfo = limit ? `\n**Лимит:** ${limit}` : '';
        const message = `❌ **Ошибка скрапинга**${limitInfo}\n\n${errorMessage}`;
        await this.sendMessage(message, true);
    }

    /**
     * Отправляет уведомление об ошибке подключения к БД
     * @param {string} errorMessage - сообщение об ошибке
     */
    async sendDatabaseError(errorMessage) {
        const message = `💾 **Ошибка базы данных**\n\n${errorMessage}`;
        await this.sendMessage(message, true);
    }

    /**
     * Отправляет уведомление об успешном запуске сервера
     */
    async sendServerStarted() {
        const message = `🚀 **Сервер запущен**\n\nСкрапер готов к работе`;
        await this.sendMessage(message, false);
    }

    /**
     * Отправляет уведомление о критической ошибке
     * @param {string} errorMessage - сообщение об ошибке
     */
    async sendCriticalError(errorMessage) {
        const message = `🔥 **КРИТИЧЕСКАЯ ОШИБКА**\n\n${errorMessage}`;
        await this.sendMessage(message, true);
    }

    /**
     * Отправляет уведомление о восстановлении работы
     * @param {string} serviceName - название сервиса
     */
    async sendRecoveryMessage(serviceName) {
        const message = `✅ **Восстановление работы**\n\n${serviceName} снова работает`;
        await this.sendMessage(message, false);
    }

    /**
     * Отправляет статистику скрапинга
     * @param {Object} stats - статистика
     */
    async sendScrapingStats(stats) {
        const message = `📊 **Статистика скрапинга**\n\n` +
            `✅ Успешных запусков: ${stats.successfulRuns}\n` +
            `❌ Ошибок: ${stats.failedRuns}\n` +
            `📈 Всего запусков: ${stats.totalRuns}`;
        
        await this.sendMessage(message, false);
    }
}

// Создаем единственный экземпляр
const telegramNotifier = new TelegramNotifier();

export default telegramNotifier; 