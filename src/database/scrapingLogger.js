import mysql from 'mysql2/promise';
import { config } from '../config/database.js';
import { logger } from '../utils/logger.js';

class ScrapingLogger {
    constructor() {
        this.connection = null;
    }

    async connect() {
        if (!this.connection) {
            this.connection = await mysql.createConnection(config.mysql);
            logger.info('[SCRAPING_LOGGER] Connected to MySQL database');
        }
        return this.connection;
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
            logger.info('[SCRAPING_LOGGER] Disconnected from MySQL database');
        }
    }

    /**
     * Логирует начало процесса скрапинга
     * @param {string} limitValue - Лимит (например, "100")
     * @returns {number} ID лога для последующего обновления
     */
    async logScrapingStart(limitValue) {
        try {
            await this.connect();
            
            const now = new Date();
            const scrapingDate = now.toISOString().split('T')[0];
            const scrapingTime = now.toTimeString().split(' ')[0];
            
            const query = `
                INSERT INTO scraping_logs (
                    scraping_date, 
                    scraping_time, 
                    scraping_datetime,
                    limit_value
                ) VALUES (?, ?, ?, ?)
            `;
            
            const [result] = await this.connection.execute(query, [
                scrapingDate,
                scrapingTime,
                now,
                limitValue
            ]);
            
            const logId = result.insertId;
            logger.info(`[SCRAPING_LOGGER] Started scraping log for ${limitValue}€, ID: ${logId}`);
            
            return logId;
            
        } catch (error) {
            logger.error('[SCRAPING_LOGGER] Error logging scraping start:', error);
            throw error;
        }
    }

    /**
     * Обновляет лог с результатами скрапинга
     * @param {number} logId - ID лога
     * @param {Object} results - Результаты скрапинга
     * @param {number} results.playersFound - Количество найденных игроков
     * @param {number} results.playersSaved - Количество сохраненных игроков
     * @param {boolean} results.databaseSuccess - Успешность сохранения в БД
     * @param {string} results.errorMessage - Сообщение об ошибке (если есть)
     * @param {number} results.executionTimeMs - Время выполнения в миллисекундах
     */
    async logScrapingResult(logId, results) {
        try {
            await this.connect();
            
            const query = `
                UPDATE scraping_logs 
                SET 
                    players_found = ?,
                    players_saved = ?,
                    database_success = ?,
                    error_message = ?,
                    execution_time_ms = ?
                WHERE id = ?
            `;
            
            await this.connection.execute(query, [
                results.playersFound || 0,
                results.playersSaved || 0,
                results.databaseSuccess || false,
                results.errorMessage || null,
                results.executionTimeMs || null,
                logId
            ]);
            
            logger.info(`[SCRAPING_LOGGER] Updated scraping log ${logId}:`, {
                playersFound: results.playersFound,
                playersSaved: results.playersSaved,
                databaseSuccess: results.databaseSuccess,
                executionTime: `${results.executionTimeMs}ms`
            });
            
        } catch (error) {
            logger.error('[SCRAPING_LOGGER] Error updating scraping log:', error);
            throw error;
        }
    }

    /**
     * Логирует завершенный процесс скрапинга (одним вызовом)
     * @param {string} limitValue - Лимит
     * @param {Object} results - Результаты скрапинга
     */
    async logCompleteScraping(limitValue, results) {
        try {
            await this.connect();
            
            const now = new Date();
            const scrapingDate = now.toISOString().split('T')[0];
            const scrapingTime = now.toTimeString().split(' ')[0];
            
            const query = `
                INSERT INTO scraping_logs (
                    scraping_date, 
                    scraping_time, 
                    scraping_datetime,
                    limit_value,
                    players_found,
                    players_saved,
                    database_success,
                    error_message,
                    execution_time_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [result] = await this.connection.execute(query, [
                scrapingDate,
                scrapingTime,
                now,
                limitValue,
                results.playersFound || 0,
                results.playersSaved || 0,
                results.databaseSuccess || false,
                results.errorMessage || null,
                results.executionTimeMs || null
            ]);
            
            logger.info(`[SCRAPING_LOGGER] Logged complete scraping for ${limitValue}€, ID: ${result.insertId}`);
            
            return result.insertId;
            
        } catch (error) {
            logger.error('[SCRAPING_LOGGER] Error logging complete scraping:', error);
            throw error;
        }
    }

    /**
     * Получает статистику логов скрапинга
     * @param {string} limitValue - Лимит (опционально)
     * @param {number} days - Количество дней назад (по умолчанию 7)
     */
    async getScrapingStats(limitValue = null, days = 7) {
        try {
            await this.connect();
            
            let query = `
                SELECT 
                    scraping_date,
                    limit_value,
                    COUNT(*) as total_runs,
                    SUM(players_found) as total_players_found,
                    SUM(players_saved) as total_players_saved,
                    SUM(CASE WHEN database_success = 1 THEN 1 ELSE 0 END) as successful_runs,
                    SUM(CASE WHEN database_success = 0 THEN 1 ELSE 0 END) as failed_runs,
                    AVG(execution_time_ms) as avg_execution_time,
                    MAX(execution_time_ms) as max_execution_time,
                    MIN(execution_time_ms) as min_execution_time
                FROM scraping_logs 
                WHERE scraping_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            `;
            
            const params = [days];
            
            if (limitValue) {
                query += ' AND limit_value = ?';
                params.push(limitValue);
            }
            
            query += ' GROUP BY scraping_date, limit_value ORDER BY scraping_date DESC, limit_value';
            
            const [rows] = await this.connection.execute(query, params);
            
            return rows;
            
        } catch (error) {
            logger.error('[SCRAPING_LOGGER] Error getting scraping stats:', error);
            throw error;
        }
    }

    /**
     * Получает последние логи скрапинга
     * @param {number} limit - Количество записей (по умолчанию 50)
     */
    async getRecentLogs(limit = 50) {
        try {
            await this.connect();
            
            const query = `
                SELECT 
                    id,
                    scraping_date,
                    scraping_time,
                    scraping_datetime,
                    limit_value,
                    players_found,
                    players_saved,
                    database_success,
                    error_message,
                    execution_time_ms,
                    created_at
                FROM scraping_logs 
                ORDER BY scraping_datetime DESC 
                LIMIT ?
            `;
            
            const [rows] = await this.connection.execute(query, [limit]);
            
            return rows;
            
        } catch (error) {
            logger.error('[SCRAPING_LOGGER] Error getting recent logs:', error);
            throw error;
        }
    }

    /**
     * Очищает старые логи (старше указанного количества дней)
     * @param {number} days - Количество дней для хранения (по умолчанию 30)
     */
    async cleanupOldLogs(days = 30) {
        try {
            await this.connect();
            
            const query = `
                DELETE FROM scraping_logs 
                WHERE scraping_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
            `;
            
            const [result] = await this.connection.execute(query, [days]);
            
            logger.info(`[SCRAPING_LOGGER] Cleaned up ${result.affectedRows} old log entries (older than ${days} days)`);
            
            return result.affectedRows;
            
        } catch (error) {
            logger.error('[SCRAPING_LOGGER] Error cleaning up old logs:', error);
            throw error;
        }
    }
}

export default ScrapingLogger; 