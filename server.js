import express from 'express';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import path from 'path';
import { logger } from './src/utils/logger.js';
import { runFullScraping } from './src/index.js';
import { isScraperRunning } from './src/utils/lockFile.js';
import { getMilanTime, getMilanDateTime } from './src/utils/timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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