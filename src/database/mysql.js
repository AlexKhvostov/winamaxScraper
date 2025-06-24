import mysql from 'mysql2/promise';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { getMilanDateOnly, getMilanDateTime } from '../utils/timezone.js';

class MySQLService {
    constructor() {
        this.connection = null;
        this.pool = null;
    }

    async connect() {
        try {
            // Создаем пул соединений для лучшей производительности
            this.pool = mysql.createPool({
                host: config.database.host,
                port: config.database.port,
                user: config.database.username,
                password: config.database.password,
                database: config.database.database,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                idleTimeout: 60000,
                acquireTimeout: 60000,
                multipleStatements: true
            });

            // Тестируем подключение
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();
            
            logger.info('MySQL подключение установлено');
            return true;
        } catch (error) {
            logger.error('Ошибка подключения к MySQL:', error);
            return false;
        }
    }

    async initDatabase() {
        try {
            // Создаем базу данных если не существует
            const tempPool = mysql.createPool({
                host: config.database.host,
                port: config.database.port,
                user: config.database.username,
                password: config.database.password,
                multipleStatements: true
            });

            const connection = await tempPool.getConnection();
            await connection.execute(`CREATE DATABASE IF NOT EXISTS ${config.database.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            connection.release();
            await tempPool.end();
            
            logger.info('База данных MySQL инициализирована');
            return true;
        } catch (error) {
            logger.error('Ошибка инициализации базы данных MySQL:', error);
            return false;
        }
    }

    /**
     * Проверяет существование записи для игрока с теми же очками в тот же день (по времени Милана)
     * @param {string} playerName - имя игрока
     * @param {string} tournamentLimit - лимит турнира
     * @param {number} points - количество очков
     * @param {Date} date - дата для проверки
     * @returns {boolean} true если запись уже существует
     */
    async checkDuplicateRecord(playerName, tournamentLimit, points, date) {
        try {
            // Получаем дату в часовом поясе Милана
            const milanDate = getMilanDateOnly(date);
            
            const query = `
                SELECT COUNT(*) as count
                FROM tournament_snapshots 
                WHERE player_name = ?
                  AND tournament_limit = ?
                  AND points = ?
                  AND scraped_date_milan = ?
                LIMIT 1
            `;
            
            const [rows] = await this.pool.execute(query, [playerName, tournamentLimit, points, milanDate]);
            const isDuplicate = rows[0].count > 0;
            
            if (isDuplicate) {
                logger.debug(`Найден дубликат: ${playerName} (${points} очков, ${milanDate})`);
            }
            
            return isDuplicate;
        } catch (error) {
            logger.error('Ошибка проверки дубликата:', error);
            return false; // В случае ошибки разрешаем вставку
        }
    }

    async insertTournamentSnapshot(data) {
        try {
            if (!Array.isArray(data) || data.length === 0) {
                logger.warn('Нет данных для вставки');
                return false;
            }

            // Используем простые INSERT запросы для каждой записи с проверкой дубликатов
            let insertedCount = 0;
            let duplicatesCount = 0;
            let errorsCount = 0;
            
            for (const row of data) {
                try {
                    const scrapedAt = row.scraped_at || new Date();
                    const milanDate = getMilanDateOnly(scrapedAt);
                    
                    // Проверяем на дубликат только если включена соответствующая настройка
                    const checkDuplicates = process.env.CHECK_DUPLICATES === 'true';
                    
                    if (checkDuplicates) {
                        const isDuplicate = await this.checkDuplicateRecord(
                            row.player_name,
                            row.tournament_limit,
                            row.points,
                            scrapedAt
                        );
                        
                        if (isDuplicate) {
                            duplicatesCount++;
                            logger.debug(`Пропущен дубликат: ${row.player_name} (${row.points} очков, ${milanDate})`);
                            continue;
                        }
                    }
                    
                    const query = `
                        INSERT INTO tournament_snapshots 
                        (tournament_limit, rank, player_name, points, guarantee, scraped_at, scraped_date_milan) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    const values = [
                        row.tournament_limit,
                        row.rank,
                        row.player_name,
                        row.points,
                        row.guarantee,
                        scrapedAt,
                        milanDate
                    ];

                    await this.pool.execute(query, values);
                    insertedCount++;
                    
                    // Логируем время записи в БД для первой записи каждого лимита
                    if (insertedCount === 1) {
                        const dbWriteTimeUTC = new Date().toISOString();
                        logger.info(`💾 Время записи в БД (UTC): ${dbWriteTimeUTC} для лимита ${row.tournament_limit}`);
                    }
                } catch (rowError) {
                    errorsCount++;
                    logger.error(`Ошибка вставки записи ${row.player_name || 'unknown'}:`, rowError.message);
                    logger.error('Данные записи:', JSON.stringify(row, null, 2));
                }
            }
            
            const totalRecords = data.length;
            
            const processingEndTimeUTC = new Date().toISOString();
            logger.info(`Обработано ${totalRecords} записей для лимита ${data[0]?.tournament_limit}:`);
            logger.info(`  ✅ Вставлено: ${insertedCount}`);
            logger.info(`  ⏭️ Пропущено дубликатов: ${duplicatesCount}`);
            logger.info(`  ❌ Ошибок: ${errorsCount}`);
            logger.info(`⏱️ Время завершения записи в БД (UTC): ${processingEndTimeUTC}`);
            
            // Обновляем метаданные
            await this.updateScrapingMetadata(data[0]?.tournament_limit, true);
            
            return {
                success: insertedCount > 0,
                insertedCount: insertedCount,
                duplicatesCount: duplicatesCount,
                errorsCount: errorsCount,
                totalRecords: totalRecords
            };
        } catch (error) {
            logger.error('Ошибка вставки данных в MySQL:', error);
            
            // Обновляем метаданные об ошибке
            if (data[0]?.tournament_limit) {
                await this.updateScrapingMetadata(data[0].tournament_limit, false, error.message);
            }
            
            return {
                success: false,
                insertedCount: 0,
                duplicatesCount: 0,
                errorsCount: data.length,
                totalRecords: data.length,
                error: error.message
            };
        }
    }

    /**
     * Добавляет поле scraped_date_milan в таблицу если его нет
     */
    async addMilanDateColumn() {
        try {
            // Проверяем, существует ли уже поле
            const checkQuery = `
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'tournament_snapshots' 
                AND COLUMN_NAME = 'scraped_date_milan'
            `;
            
            const [columns] = await this.pool.execute(checkQuery);
            
            if (columns.length === 0) {
                // Поле не существует, добавляем его
                const query = `
                    ALTER TABLE tournament_snapshots 
                    ADD COLUMN scraped_date_milan DATE 
                    COMMENT 'Дата скрапинга в часовом поясе Милана'
                `;
                
                await this.pool.execute(query);
                logger.info('Поле scraped_date_milan добавлено в таблицу');
                
                // Создаем индекс для быстрого поиска дубликатов
                const indexQuery = `
                    CREATE INDEX idx_duplicates_milan 
                    ON tournament_snapshots (player_name, tournament_limit, points, scraped_date_milan)
                `;
                
                await this.pool.execute(indexQuery);
                logger.info('Индекс для проверки дубликатов создан');
                
                // Обновляем существующие записи
                const updateQuery = `
                    UPDATE tournament_snapshots 
                    SET scraped_date_milan = DATE(CONVERT_TZ(scraped_at, '+00:00', '+01:00'))
                    WHERE scraped_date_milan IS NULL
                `;
                
                await this.pool.execute(updateQuery);
                logger.info('Существующие записи обновлены');
            } else {
                logger.info('Поле scraped_date_milan уже существует');
            }
            
        } catch (error) {
            logger.error('Ошибка добавления поля scraped_date_milan:', error);
        }
    }

    async updateScrapingMetadata(tournamentLimit, success, errorMessage = null) {
        try {
            if (success) {
                await this.pool.execute(`
                    UPDATE scraping_metadata 
                    SET last_successful_scrape = NOW(), 
                        total_scrapes = total_scrapes + 1,
                        error_count = 0,
                        last_error_message = NULL,
                        last_error_time = NULL
                    WHERE tournament_limit = ?
                `, [tournamentLimit]);
            } else {
                await this.pool.execute(`
                    UPDATE scraping_metadata 
                    SET error_count = error_count + 1,
                        last_error_message = ?,
                        last_error_time = NOW()
                    WHERE tournament_limit = ?
                `, [errorMessage, tournamentLimit]);
            }
        } catch (error) {
            logger.error('Ошибка обновления метаданных:', error);
        }
    }

    async getPlayerData(playerName, tournamentLimit, hoursBack = 2) {
        try {
            const query = `
                SELECT 
                    player_name,
                    tournament_limit,
                    scraped_at as created_at,
                    points,
                    rank
                FROM tournament_snapshots 
                WHERE player_name = ?
                  AND tournament_limit = ?
                  AND scraped_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
                ORDER BY scraped_at DESC
                LIMIT 20
            `;

            const [rows] = await this.pool.execute(query, [playerName, tournamentLimit, hoursBack]);
            return rows;
        } catch (error) {
            logger.error('Ошибка получения данных игрока:', error);
            return [];
        }
    }

    async getPlayerVelocity(playerName, tournamentLimit, hoursBack = 2) {
        try {
            const query = `
                SELECT 
                    player_name,
                    tournament_limit,
                    scraped_at,
                    points,
                    rank,
                    LAG(points) OVER (PARTITION BY player_name, tournament_limit ORDER BY scraped_at) as prev_points,
                    LAG(scraped_at) OVER (PARTITION BY player_name, tournament_limit ORDER BY scraped_at) as prev_time,
                    LAG(rank) OVER (PARTITION BY player_name, tournament_limit ORDER BY scraped_at) as prev_rank
                FROM tournament_snapshots 
                WHERE player_name = ?
                  AND tournament_limit = ?
                  AND scraped_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
                ORDER BY scraped_at DESC
                LIMIT 20
            `;

            const [rows] = await this.pool.execute(query, [playerName, tournamentLimit, hoursBack]);
            return rows;
        } catch (error) {
            logger.error('Ошибка получения скорости игрока:', error);
            return [];
        }
    }

    async getTopFastPlayers(tournamentLimit, limit = 10) {
        try {
            // Упрощенный запрос для MySQL (без CTE)
            const query = `
                SELECT 
                    t1.player_name,
                    AVG(
                        CASE 
                            WHEN t2.points IS NOT NULL AND t2.scraped_at IS NOT NULL 
                            THEN (t1.points - t2.points) / (TIMESTAMPDIFF(MINUTE, t2.scraped_at, t1.scraped_at) + 1)
                            ELSE 0 
                        END
                    ) as avg_velocity,
                    MAX(t1.points) as current_points,
                    MIN(t1.rank) as best_rank
                FROM tournament_snapshots t1
                LEFT JOIN tournament_snapshots t2 ON 
                    t1.player_name = t2.player_name 
                    AND t1.tournament_limit = t2.tournament_limit
                    AND t2.scraped_at < t1.scraped_at
                    AND t2.scraped_at = (
                        SELECT MAX(t3.scraped_at) 
                        FROM tournament_snapshots t3 
                        WHERE t3.player_name = t1.player_name 
                          AND t3.tournament_limit = t1.tournament_limit 
                          AND t3.scraped_at < t1.scraped_at
                    )
                WHERE t1.tournament_limit = ?
                  AND t1.scraped_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                  AND t2.points IS NOT NULL
                GROUP BY t1.player_name
                HAVING avg_velocity > 0
                ORDER BY avg_velocity DESC
                LIMIT ?
            `;

            const [rows] = await this.pool.execute(query, [tournamentLimit, limit]);
            return rows;
        } catch (error) {
            logger.error('Ошибка получения быстрых игроков:', error);
            return [];
        }
    }

    async getPlayerStats(playerName, tournamentLimit, daysBack = 7) {
        try {
            const query = `
                SELECT 
                    date,
                    first_seen,
                    last_seen,
                    min_rank,
                    max_rank,
                    min_points,
                    max_points,
                    points_gained,
                    sessions_count,
                    avg_rank,
                    rank_changes
                FROM player_stats
                WHERE player_name = ?
                  AND tournament_limit = ?
                  AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
                ORDER BY date DESC
            `;

            const [rows] = await this.pool.execute(query, [playerName, tournamentLimit, daysBack]);
            return rows;
        } catch (error) {
            logger.error('Ошибка получения статистики игрока:', error);
            return [];
        }
    }

    async getTopActivePlayers(tournamentLimit, daysBack = 7, limit = 20) {
        try {
            const query = `
                SELECT 
                    player_name,
                    COUNT(*) as total_appearances,
                    AVG(points) as avg_points,
                    MAX(points) as max_points,
                    MIN(rank) as best_rank,
                    AVG(rank) as avg_rank,
                    COUNT(DISTINCT DATE(scraped_at)) as active_days,
                    MAX(scraped_at) as last_seen
                FROM tournament_snapshots
                WHERE tournament_limit = ?
                  AND scraped_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY player_name
                HAVING total_appearances >= 10
                ORDER BY total_appearances DESC, avg_points DESC
                LIMIT ?
            `;

            const [rows] = await this.pool.execute(query, [tournamentLimit, daysBack, limit]);
            return rows;
        } catch (error) {
            logger.error('Ошибка получения топ активных игроков:', error);
            return [];
        }
    }

    async executeQuery(query, params = []) {
        try {
            const [rows] = await this.pool.execute(query, params);
            return rows;
        } catch (error) {
            logger.error('Ошибка выполнения запроса:', error);
            throw error;
        }
    }

    async ping() {
        try {
            const connection = await this.pool.getConnection();
            await connection.ping();
            connection.release();
            return true;
        } catch (error) {
            return false;
        }
    }

    async getVersion() {
        try {
            const [rows] = await this.pool.execute('SELECT VERSION() as version');
            return rows[0].version;
        } catch (error) {
            return 'Unknown';
        }
    }

    async getDatabases() {
        try {
            const [rows] = await this.pool.execute('SHOW DATABASES');
            return rows.map(row => ({ name: row.Database }));
        } catch (error) {
            return [];
        }
    }

    async getTables() {
        try {
            const [rows] = await this.pool.execute(`SHOW TABLES FROM ${config.database.database}`);
            const tableKey = `Tables_in_${config.database.database}`;
            return rows.map(row => ({ name: row[tableKey] }));
        } catch (error) {
            return [];
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            logger.info('MySQL соединение закрыто');
        }
    }
}

export const mysqlService = new MySQLService();
export { MySQLService }; 