import cron from 'node-cron';
import { WinamaxScraper } from './src/scrapers/winamaxScraper.js';
import { MySQLService } from './src/database/mysql.js';
import { logger } from './src/utils/logger.js';
import { createLockFile, removeLockFile, setupLockFileCleanup, isScraperRunning } from './src/utils/lockFile.js';
import { getTimezoneInfo } from './src/utils/timezone.js';

console.log('🚀 Запуск автоматического скрапинга Winamax Expresso');
console.log('⏰ Сбор данных каждые 10 минут');
console.log('🌍 Часовой пояс:', process.env.TIMEZONE || 'Europe/Rome');
console.log('📊 Логи доступны: npm start scraping-logs recent');
console.log('🛑 Остановка: Ctrl+C');
console.log('─'.repeat(60));

// Проверяем, не запущен ли уже скрапер
const preventParallel = process.env.PREVENT_PARALLEL_RUNS === 'true';
if (preventParallel && isScraperRunning()) {
    console.log('❌ Скрапер уже запущен! Для предотвращения дублирования завершаем этот процесс.');
    console.log('💡 Если предыдущий процесс завис, удалите файл scraper.lock');
    process.exit(1);
}

// Создаем lock файл
if (preventParallel && !createLockFile()) {
    console.log('❌ Не удалось создать lock файл');
    process.exit(1);
}

// Настраиваем автоматическую очистку lock файла
setupLockFileCleanup();

let isRunning = false;

async function runScraping() {
    if (isRunning) {
        logger.warn('[SCHEDULER] Предыдущий сбор еще выполняется, пропускаем...');
        return;
    }

    isRunning = true;
    const startTime = Date.now();
    
    try {
        const timezoneInfo = getTimezoneInfo();
        const startTimeUTC = new Date().toISOString();
        logger.info(`[SCHEDULER] 🚀 Начинаем автоматический сбор данных`);
        logger.info(`[SCHEDULER] ⏰ Время запуска (UTC): ${startTimeUTC}`);
        logger.info(`[SCHEDULER] 🇮🇹 Время Милана: ${timezoneInfo.currentTime}`);
        
        const scraper = new WinamaxScraper();
        const database = new MySQLService();
        
        await scraper.initialize();
        await database.connect();
        
        // Добавляем поле для даты Милана если его нет
        await database.addMilanDateColumn();
        
        // Получаем активные лимиты
        const limitsConfig = scraper.getActiveLimitsConfig();
        const activeLimits = Object.keys(limitsConfig).filter(limit => limitsConfig[limit].active);
        
        if (activeLimits.length === 0) {
            logger.warn('[SCHEDULER] ❌ Нет активных лимитов для сбора');
            return;
        }
        
        logger.info(`[SCHEDULER] 📈 Сбор данных для ${activeLimits.length} лимитов: ${activeLimits.join(', ')}`);
        
        // Собираем данные
        const scrapingResult = await scraper.scrapeAllLimits(limitsConfig);
        const { players: playersData, scrapingResults } = scrapingResult;
        
        if (playersData.length === 0) {
            logger.warn('[SCHEDULER] ⚠️ Нет данных для сохранения');
            return;
        }
        
        // Группируем данные по лимитам для сохранения
        const dataByLimit = {};
        playersData.forEach(player => {
            if (!dataByLimit[player.limit]) {
                dataByLimit[player.limit] = [];
            }
            dataByLimit[player.limit].push({
                tournament_limit: player.limit,
                rank: player.rank,
                player_name: player.name,
                points: player.points,
                guarantee: player.guarantee,
                scraped_at: player.scraped_at || new Date().toISOString()
            });
        });
        
        // Сохраняем данные по каждому лимиту отдельно
        const dbResults = {};
        let totalInserted = 0;
        
        for (const [limitName, limitData] of Object.entries(dataByLimit)) {
            try {
                const result = await database.insertTournamentSnapshot(limitData);
                dbResults[limitName] = result;
                totalInserted += result.insertedCount;
            } catch (error) {
                logger.error(`[SCHEDULER] Ошибка сохранения лимита ${limitName}:`, error);
                dbResults[limitName] = {
                    success: false,
                    insertedCount: 0,
                    error: error.message
                };
            }
        }
        
        // Логируем результаты ПОСЛЕ сохранения в БД
        await scraper.logScrapingResults(scrapingResults, dbResults);
        
        const executionTime = Date.now() - startTime;
        logger.info(`[SCHEDULER] ✅ Сбор завершен: ${totalInserted} игроков сохранено за ${executionTime}мс`);
        
        // Предупреждение если близко к полуночи
        if (timezoneInfo.isNearMidnight) {
            logger.warn('[SCHEDULER] ⚠️ Близко к полуночи по времени Милана - возможен сброс очков у игроков');
        }
        
        await scraper.close();
        await database.close();
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`[SCHEDULER] ❌ Ошибка сбора данных (${executionTime}мс):`, error);
    } finally {
        isRunning = false;
    }
}

// Запускаем сразу при старте
console.log('🔥 Выполняем первый сбор данных...');
runScraping();

// Настраиваем cron для запуска каждые 10 минут
const interval = process.env.SCRAPING_INTERVAL_MINUTES || 10;
cron.schedule(`*/${interval} * * * *`, () => {
    const timezoneInfo = getTimezoneInfo();
    console.log(`\n⏰ [${timezoneInfo.currentTime}] Запуск планового сбора данных...`);
    runScraping();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал остановки...');
    console.log('📊 Последние логи: npm start scraping-logs recent');
    if (preventParallel) {
        removeLockFile();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Получен сигнал завершения...');
    if (preventParallel) {
        removeLockFile();
    }
    process.exit(0);
}); 