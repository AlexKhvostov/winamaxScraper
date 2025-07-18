import express from 'express';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';
import { logger } from './src/utils/logger.js';
import { runFullScraping } from './src/index.js';
import { isScraperRunning } from './src/utils/lockFile.js';
import { getMilanDateTime } from './src/utils/timezone.js';
import { getAllLimitCodes } from './src/config/limits.js';
import ScrapingLogger from './src/database/scrapingLogger.js';
import telegramNotifier from './src/utils/telegramNotifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация ScrapingLogger
const scrapingLogger = new ScrapingLogger();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Переменные для отслеживания состояния
let lastScrapingTime = null;
let lastScrapingResult = null;
let isCurrentlyRunning = false;
let scrapingStats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    lastError: null
};

// Время запуска сервера и местоположение
const serverStartTime = new Date().toISOString();
const serverLocation = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    country: 'Unknown'
};

// Main route for monitoring interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Management panel route
app.get('/public/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/status', (req, res) => {
    const now = new Date();
    const startTime = new Date(serverStartTime);
    const uptimeMs = now.getTime() - startTime.getTime();
    
    res.json({
        status: 'running',
        server: 'Winamax Analytics Scraper',
        time: now.toISOString(),
        milanTime: getMilanDateTime(),
        isScrapingRunning: isCurrentlyRunning,
        lastScrapingTime,
        lastScrapingResult,
        stats: scrapingStats,
        serverStartTime: serverStartTime,
        uptime: uptimeMs,
        location: serverLocation
    });
});

app.get('/api/scraping/status', (req, res) => {
    res.json({
        isRunning: isCurrentlyRunning,
        lastRun: lastScrapingTime,
        lastResult: lastScrapingResult,
        stats: scrapingStats
    });
});

app.post('/api/scraping/start', async (req, res) => {
    if (isCurrentlyRunning) {
        return res.status(409).json({
            error: 'Скрапинг уже выполняется',
            isRunning: true
        });
    }

    try {
        // Запускаем скрапинг в фоновом режиме
        runScrapingTask();
        
        res.json({
            message: 'Скрапинг запущен',
            startTime: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Ошибка запуска скрапинга через API:', error);
        res.status(500).json({
            error: 'Ошибка запуска скрапинга',
            details: error.message
        });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API для получения истории запусков скрапера
app.get('/api/scraping/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 150;
        const logs = await scrapingLogger.getRecentLogs(limit * 3); // Получаем больше записей для группировки
        
        // Группируем логи по времени запуска (в пределах 2 минут считаем одним запуском)
        const groupedRuns = [];
        const processedTimes = new Set();
        
        // Все возможные лимиты (в правильном порядке)
        const allLimits = getAllLimitCodes();
        
        for (const log of logs) {
            const logTime = new Date(log.scraping_datetime + 'Z').getTime();
            const timeKey = Math.floor(logTime / (2 * 60 * 1000)); // Группируем по 2-минутным интервалам
            
            if (processedTimes.has(timeKey)) {
                continue;
            }
            
            processedTimes.add(timeKey);
            
            // Находим все логи в этом временном окне
            const runLogs = logs.filter(l => {
                const lTime = new Date(l.scraping_datetime + 'Z').getTime();
                return Math.abs(lTime - logTime) <= 2 * 60 * 1000; // В пределах 2 минут
            });
            
            if (runLogs.length === 0) continue;
            
            // Создаем объект запуска
            const run = {
                startTime: new Date(Math.min(...runLogs.map(l => new Date(l.scraping_datetime + 'Z').getTime()))),
                limits: {},
                totalFound: 0,
                totalSaved: 0,
                success: runLogs.every(l => l.database_success),
                duration: Math.max(...runLogs.map(l => l.execution_time_ms || 0)),
                logId: log.id
            };
            
            // Инициализируем все лимиты
            allLimits.forEach(limit => {
                run.limits[limit] = {
                    processed: false,
                    found: 0,
                    saved: 0,
                    success: false
                };
            });
            
            // Заполняем данные по обработанным лимитам
            runLogs.forEach(log => {
                const limitValue = log.limit_value;
                if (run.limits[limitValue]) {
                    run.limits[limitValue] = {
                        processed: true,
                        found: log.players_found || 0,
                        saved: log.players_saved || 0,
                        success: log.database_success || false
                    };
                    run.totalFound += log.players_found || 0;
                    run.totalSaved += log.players_saved || 0;
                }
            });
            
            groupedRuns.push(run);
            
            if (groupedRuns.length >= limit) {
                break;
            }
        }
        
        // Сортируем по ID (новые сверху)
        groupedRuns.sort((a, b) => b.logId - a.logId);
        
        // Вычисляем интервалы между успешными запусками
        let lastSuccessfulTime = null;
        groupedRuns.forEach(run => {
            if (run.success && lastSuccessfulTime) {
                const intervalMinutes = Math.floor((lastSuccessfulTime - new Date(run.startTime)) / (1000 * 60));
                run.intervalFromPrevious = intervalMinutes;
                run.isDelayed = intervalMinutes > 10; // Помечаем как задержанный если > 10 минут
            } else {
                run.intervalFromPrevious = null;
                run.isDelayed = false;
            }
            
            if (run.success) {
                lastSuccessfulTime = new Date(run.startTime);
            }
        });
        
        res.json({
            runs: groupedRuns.slice(0, limit),
            total: groupedRuns.length,
            allLimits: allLimits
        });
        
    } catch (error) {
        logger.error('Ошибка получения истории запусков:', error);
        res.status(500).json({
            error: 'Ошибка получения истории запусков',
            details: error.message
        });
    }
});

// API для получения общей статистики
app.get('/api/stats', async (req, res) => {
    try {
        const connection = await scrapingLogger.connect();
        
        // Получаем статистику из основной таблицы с данными игроков
        const [playerStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_records,
                COUNT(DISTINCT player_name) as unique_players,
                MIN(scraped_at) as first_record_date,
                MAX(scraped_at) as last_record_date
            FROM tournament_snapshots
        `);
        
        // Получаем статистику запусков скрапера
        const [scrapingStats] = await connection.execute(`
            SELECT 
                COUNT(*) as total_scraping_runs,
                COUNT(CASE WHEN database_success = 1 THEN 1 END) as successful_runs,
                COUNT(CASE WHEN database_success = 0 THEN 1 END) as failed_runs,
                MIN(scraping_datetime) as first_scraping_date,
                MAX(scraping_datetime) as last_scraping_date,
                SUM(players_found) as total_players_found,
                SUM(players_saved) as total_players_saved
            FROM scraping_logs
        `);
        
        // Получаем статистику по лимитам
        const [limitStats] = await connection.execute(`
            SELECT 
                limit_value,
                COUNT(*) as runs_count,
                SUM(players_found) as total_found,
                SUM(players_saved) as total_saved,
                COUNT(CASE WHEN database_success = 1 THEN 1 END) as successful_runs
            FROM scraping_logs 
            GROUP BY limit_value
            ORDER BY 
                CASE 
                    WHEN limit_value = '0.25' THEN 1
                    WHEN limit_value = '0.5' THEN 2
                    WHEN limit_value = '1-1.5' THEN 3
                    WHEN limit_value = '2-3' THEN 4
                    WHEN limit_value = '4-7' THEN 5
                    WHEN limit_value = '8-15' THEN 6
                    WHEN limit_value = '16-25' THEN 7
                    WHEN limit_value = '50' THEN 8
                    WHEN limit_value = '100' THEN 9
                    WHEN limit_value = '250' THEN 10
                    WHEN limit_value = '500' THEN 11
                    ELSE 12
                END
        `);
        
        res.json({
            playerData: playerStats[0] || {},
            scrapingRuns: scrapingStats[0] || {},
            limitBreakdown: limitStats || []
        });
        
    } catch (error) {
        logger.error('Ошибка получения общей статистики:', error);
        res.status(500).json({
            error: 'Ошибка получения статистики',
            details: error.message
        });
    }
});

// Функция запуска скрапинга
async function runScrapingTask() {
    if (isCurrentlyRunning) {
        logger.warn('Скрапинг уже выполняется, пропускаем запуск');
        return;
    }

    // Проверяем lock файл
    if (await isScraperRunning()) {
        logger.warn('Обнаружен lock файл, скрапинг уже выполняется');
        return;
    }

    isCurrentlyRunning = true;
    lastScrapingTime = new Date().toISOString();
    scrapingStats.totalRuns++;

    const startTimeUTC = new Date().toISOString();
    logger.info('🚀 Запуск автоматического сбора данных');
    logger.info(`⏰ Время запуска (UTC): ${startTimeUTC}`);
    logger.info(`🇮🇹 Время Милана: ${getMilanDateTime()}`);

    try {
        const result = await runFullScraping();
        
        lastScrapingResult = {
            success: true,
            timestamp: new Date().toISOString(),
            message: 'Сбор данных завершен успешно',
            result: result
        };
        
        scrapingStats.successfulRuns++;
        scrapingStats.lastError = null;
        
        logger.info('✅ Автоматический сбор данных завершен успешно');
        
        // Отправляем статистику каждые 240 успешных запусков
        if (scrapingStats.successfulRuns % 240 === 0) {
            await telegramNotifier.sendScrapingStats(scrapingStats);
        }
        
    } catch (error) {
        logger.error('❌ Ошибка автоматического сбора данных:', error);
        
        // Отправляем уведомление об ошибке скрапинга
        await telegramNotifier.sendScrapingError(error.message);
        
        lastScrapingResult = {
            success: false,
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack
        };
        
        scrapingStats.failedRuns++;
        scrapingStats.lastError = {
            message: error.message,
            timestamp: new Date().toISOString()
        };
        
        // Отправляем уведомление о восстановлении после 3 ошибок подряд
        if (scrapingStats.failedRuns % 3 === 0) {
            await telegramNotifier.sendRecoveryMessage('Скрапер');
        }
    } finally {
        isCurrentlyRunning = false;
    }
}

// Настройка cron задач
function setupCronJobs() {
    // Получаем интервал из .env файла (по умолчанию 10 минут)
    const intervalMinutes = parseInt(process.env.SCRAPING_INTERVAL_MINUTES) || 10;
    
    // Создаем cron выражение для указанного интервала со смещением в 3 минуты
    const cronExpression = `3-59/${intervalMinutes} * * * *`;
    
    cron.schedule(cronExpression, () => {
        logger.info(`⏰ Запуск по расписанию (каждые ${intervalMinutes} минут, смещение 3 минуты)`);
        runScrapingTask();
    });

    logger.info(`📅 Cron задача настроена: сбор данных каждые ${intervalMinutes} минут со смещением 3 минуты`);
}

// Запуск сервера
app.listen(PORT, async () => {
    logger.info(`🌐 Сервер запущен на порту ${PORT}`);
    logger.info(`📡 API доступно по адресу: http://localhost:${PORT}/api/`);
    logger.info(`🔗 Статус: http://localhost:${PORT}/api/status`);
    logger.info(`⏰ Время сервера: ${new Date().toISOString()}`);
    logger.info(`🇮🇹 Время Милана: ${getMilanDateTime()}`);
    
    // Отправляем уведомление о запуске сервера
    await telegramNotifier.sendServerStarted();
    
    // Настраиваем автоматический сбор
    setupCronJobs();
    
    // Запускаем первый сбор через 30 секунд после старта
    setTimeout(() => {
        logger.info('🎯 Запуск первоначального сбора данных');
        runScrapingTask();
    }, 30000);
});

// Обработка ошибок
process.on('uncaughtException', async (error) => {
    logger.error('Необработанная ошибка:', error);
    await telegramNotifier.sendCriticalError(`Необработанная ошибка: ${error.message}`);
});

process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Необработанное отклонение промиса:', reason);
    await telegramNotifier.sendCriticalError(`Необработанное отклонение промиса: ${reason}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Получен сигнал SIGTERM, завершаем работу...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('Получен сигнал SIGINT, завершаем работу...');
    process.exit(0);
});

export default app; 