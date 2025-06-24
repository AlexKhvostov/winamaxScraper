import express from 'express';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';
import { logger } from './src/utils/logger.js';
import { runFullScraping } from './src/index.js';
import { isScraperRunning } from './src/utils/lockFile.js';
import { getMilanTime, getMilanDateTime } from './src/utils/timezone.js';
import ScrapingLogger from './src/database/scrapingLogger.js';

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
    res.json({
        status: 'running',
        server: 'Winamax Analytics Scraper',
        time: new Date().toISOString(),
        milanTime: getMilanDateTime(),
        isScrapingRunning: isCurrentlyRunning,
        lastScrapingTime,
        lastScrapingResult,
        stats: scrapingStats
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
        
        // Все возможные лимиты
        const allLimits = ['0.25', '0.5', '1-1.5', '2-3', '4-7', '8-15', '16-25', '50', '100', '250', '500'];
        
        for (const log of logs) {
            const logTime = new Date(log.scraping_datetime).getTime();
            const timeKey = Math.floor(logTime / (2 * 60 * 1000)); // Группируем по 2-минутным интервалам
            
            if (processedTimes.has(timeKey)) {
                continue;
            }
            
            processedTimes.add(timeKey);
            
            // Находим все логи в этом временном окне
            const runLogs = logs.filter(l => {
                const lTime = new Date(l.scraping_datetime).getTime();
                return Math.abs(lTime - logTime) <= 2 * 60 * 1000; // В пределах 2 минут
            });
            
            if (runLogs.length === 0) continue;
            
            // Создаем объект запуска
            const run = {
                startTime: new Date(Math.min(...runLogs.map(l => new Date(l.scraping_datetime).getTime()))),
                limits: {},
                totalFound: 0,
                totalSaved: 0,
                success: runLogs.every(l => l.database_success),
                duration: Math.max(...runLogs.map(l => l.execution_time_ms || 0))
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
        
        // Сортируем по времени (новые сверху)
        groupedRuns.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
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

    logger.info('🚀 Запуск автоматического сбора данных');
    logger.info(`⏰ Время Милана: ${getMilanDateTime()}`);

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
        
    } catch (error) {
        logger.error('❌ Ошибка автоматического сбора данных:', error);
        
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
    } finally {
        isCurrentlyRunning = false;
    }
}

// Настройка cron задач
function setupCronJobs() {
    // Получаем интервал из .env файла (по умолчанию 10 минут)
    const intervalMinutes = parseInt(process.env.SCRAPING_INTERVAL_MINUTES) || 10;
    
    // Создаем cron выражение для указанного интервала
    const cronExpression = `*/${intervalMinutes} * * * *`;
    
    cron.schedule(cronExpression, () => {
        logger.info(`⏰ Запуск по расписанию (каждые ${intervalMinutes} минут)`);
        runScrapingTask();
    });

    logger.info(`📅 Cron задача настроена: сбор данных каждые ${intervalMinutes} минут`);
}

// Запуск сервера
app.listen(PORT, () => {
    logger.info(`🌐 Сервер запущен на порту ${PORT}`);
    logger.info(`📡 API доступно по адресу: http://localhost:${PORT}/api/`);
    logger.info(`🔗 Статус: http://localhost:${PORT}/api/status`);
    logger.info(`⏰ Время сервера: ${new Date().toISOString()}`);
    logger.info(`🇮🇹 Время Милана: ${getMilanDateTime()}`);
    
    // Настраиваем автоматический сбор
    setupCronJobs();
    
    // Запускаем первый сбор через 30 секунд после старта
    setTimeout(() => {
        logger.info('🎯 Запуск первоначального сбора данных');
        runScrapingTask();
    }, 30000);
});

// Обработка ошибок
process.on('uncaughtException', (error) => {
    logger.error('Необработанная ошибка:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Необработанное отклонение промиса:', reason);
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