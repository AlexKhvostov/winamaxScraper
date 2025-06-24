#!/usr/bin/env node

import dotenv from 'dotenv';
import { WinamaxScraper } from './scrapers/winamaxScraper.js';
import { MySQLService } from './database/mysql.js';
import { logger } from './utils/logger.js';
import { 
    getActiveLimitsFromFile, 
    isLimitsFileActive, 
    addLimitToFile, 
    removeLimitFromFile, 
    printLimitsFileStatus 
} from './utils/limitsFile.js';
import { 
    addToWhitelist, 
    removeFromWhitelist, 
    clearWhitelist, 
    printWhitelistStatus 
} from './utils/whitelist.js';
import { getTimezoneInfo } from './utils/timezone.js';

// Загружаем переменные окружения
dotenv.config();

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const arg1 = args[1];
    const arg2 = args[2];

    try {
        switch (command) {
            case 'test':
                await testScraping();
                break;
            case 'timezone-info':
                await showTimezoneInfo();
                break;
            case 'limits-file':
                await manageLimitsFile(arg1, arg2);
                break;
            case 'whitelist':
                await manageWhitelist(arg1, arg2);
                break;
            case 'points-filter':
                await managePointsFilter(arg1);
                break;
            case 'duplicate-check':
                await handleDuplicateCheck(arg1);
                break;
            case 'scraping-logs':
                await manageScrapingLogs(arg1, arg2);
                break;
            default:
                console.log('🤖 Winamax Scraper - Доступные команды:');
                console.log('  npm run test                         - Тестовый сбор данных');
                console.log('  npm run timezone-info                - Информация о часовом поясе');
                console.log('  npm run limits                       - Управление лимитами');
                console.log('  npm run whitelist                    - Управление whitelist');
                console.log('  npm run points-filter [value]        - Управление фильтром очков');
                console.log('  npm run duplicate-check [on/off]     - Управление проверкой дубликатов');
                console.log('  npm run logs                         - Просмотр логов скрапинга');
                break;
        }
    } catch (error) {
        logger.error('Ошибка выполнения команды:', error);
        process.exit(1);
    }
}

async function showTimezoneInfo() {
    console.log('\n🌍 Информация о часовом поясе:');
    console.log('─'.repeat(50));
    
    const timezoneInfo = getTimezoneInfo();
    
    console.log(`Часовой пояс: ${timezoneInfo.timezone}`);
    console.log(`Текущее время (Милан): ${timezoneInfo.currentTime}`);
    console.log(`Текущая дата (Милан): ${timezoneInfo.currentDate}`);
    console.log(`Близко к полуночи: ${timezoneInfo.isNearMidnight ? '⚠️ ДА' : '✅ НЕТ'}`);
    console.log(`UTC смещение: ${timezoneInfo.utcOffset} минут`);
    
    console.log('\n⚙️ Настройки:');
    console.log(`TIMEZONE: ${process.env.TIMEZONE || 'Europe/Rome (по умолчанию)'}`);
    console.log(`HANDLE_MIDNIGHT_RESET: ${process.env.HANDLE_MIDNIGHT_RESET || 'true (по умолчанию)'}`);
    console.log(`CHECK_DUPLICATES: ${process.env.CHECK_DUPLICATES || 'true (по умолчанию)'}`);
    console.log(`PREVENT_PARALLEL_RUNS: ${process.env.PREVENT_PARALLEL_RUNS || 'true (по умолчанию)'}`);
    
    if (timezoneInfo.isNearMidnight) {
        console.log('\n⚠️ ВНИМАНИЕ: Близко к полуночи по времени Милана!');
        console.log('   В полночь у всех игроков сбрасываются очки.');
        console.log('   Система автоматически учтет это при расчетах.');
    }
}

async function testScraping() {
    const startTimeUTC = new Date().toISOString();
    logger.info('🧪 Тестовый сбор данных');
    logger.info(`⏰ Время запуска (UTC): ${startTimeUTC}`);
    
    try {
        const scraper = new WinamaxScraper();
        const database = new MySQLService();
        
        await scraper.initialize();
        await database.connect();
        
        // Получаем активные лимиты
        const limitsConfig = scraper.getActiveLimitsConfig();
        const activeLimits = Object.keys(limitsConfig).filter(limit => limitsConfig[limit].active);
        
        if (activeLimits.length === 0) {
            logger.warn('❌ Нет активных лимитов для сбора');
            return;
        }
        
        logger.info(`📈 Сбор данных для ${activeLimits.length} лимитов: ${activeLimits.join(', ')}`);
        
        // Добавляем поле scraped_date_milan если его нет
        await database.addMilanDateColumn();
        
        // Собираем данные
        const scrapingResult = await scraper.scrapeAllLimits(limitsConfig);
        const { players: playersData, scrapingResults } = scrapingResult;
        
        if (playersData.length === 0) {
            logger.warn('⚠️ Нет данных для сохранения');
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
                scraped_at: player.scraped_at || new Date()
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
                logger.error(`Ошибка сохранения лимита ${limitName}:`, error);
                dbResults[limitName] = {
                    success: false,
                    insertedCount: 0,
                    error: error.message
                };
            }
        }
        
        // Логируем результаты ПОСЛЕ сохранения в БД
        await scraper.logScrapingResults(scrapingResults, dbResults);
        
        if (totalInserted > 0) {
            logger.info(`🎉 Тестовый сбор завершен успешно: сохранено ${totalInserted} игроков`);
        } else {
            logger.error('❌ Ошибка сохранения данных');
        }
        
        await scraper.close();
        await database.close();
        
    } catch (error) {
        logger.error('❌ Ошибка тестового сбора:', error);
    }
}

async function manageLimitsFile(action, limitCode) {
    switch (action) {
        case 'add':
            if (!limitCode) {
                console.log('❌ Укажите код лимита: npm run limits add "50"');
                console.log('Доступные лимиты: 0.25, 0.5, 1-1.5, 2-3, 4-7, 8-15, 16-25, 50, 100, 250, 500');
                return;
            }
            const added = addLimitToFile(limitCode);
            if (added) {
                console.log(`✅ Лимит "${limitCode}" активирован в файле`);
                printLimitsFileStatus();
            } else {
                console.log(`❌ Ошибка активации лимита "${limitCode}"`);
            }
            break;
            
        case 'remove':
            if (!limitCode) {
                console.log('❌ Укажите код лимита: npm run limits remove "50"');
                return;
            }
            const removed = removeLimitFromFile(limitCode);
            if (removed) {
                console.log(`✅ Лимит "${limitCode}" деактивирован в файле`);
                printLimitsFileStatus();
            } else {
                console.log(`⚠️  Лимит "${limitCode}" не найден в активных`);
            }
            break;
            
        default:
            printLimitsFileStatus();
            break;
    }
}

async function manageWhitelist(action, playerName) {
    switch (action) {
        case 'add':
            if (!playerName) {
                console.log('❌ Укажите имя игрока: npm run whitelist add "PlayerName"');
                return;
            }
            const added = addToWhitelist(playerName);
            if (added) {
                console.log(`✅ Игрок "${playerName}" добавлен в whitelist`);
                printWhitelistStatus();
            } else {
                console.log(`⚠️  Игрок "${playerName}" уже в whitelist или произошла ошибка`);
            }
            break;
            
        case 'remove':
            if (!playerName) {
                console.log('❌ Укажите имя игрока: npm run whitelist remove "PlayerName"');
                return;
            }
            const removed = removeFromWhitelist(playerName);
            if (removed) {
                console.log(`✅ Игрок "${playerName}" удален из whitelist`);
                printWhitelistStatus();
            } else {
                console.log(`⚠️  Игрок "${playerName}" не найден в whitelist`);
            }
            break;
            
        case 'clear':
            const cleared = clearWhitelist();
            if (cleared) {
                console.log('✅ Whitelist очищен');
                printWhitelistStatus();
            } else {
                console.log('❌ Ошибка очистки whitelist');
            }
            break;
            
        default:
            printWhitelistStatus();
            break;
    }
}

async function managePointsFilter(newValue) {
    const fs = await import('fs');
    
    if (!newValue) {
        // Показываем текущее значение
        const currentValue = process.env.MIN_POINTS_FILTER !== undefined ? parseInt(process.env.MIN_POINTS_FILTER) : 5;
        console.log(`\n🎯 ТЕКУЩИЙ ФИЛЬТР ОЧКОВ: ${currentValue}`);
        console.log('Сохраняются только игроки с количеством очков больше этого значения');
        console.log('\nДля изменения используйте: npm run points-filter <новое_значение>');
        console.log('Пример: npm run points-filter 10');
        return;
    }
    
    const value = parseInt(newValue);
    if (isNaN(value) || value < 0) {
        console.log('❌ Ошибка: значение должно быть положительным числом');
        return;
    }
    
    try {
        // Читаем .env файл
        const envPath = '.env';
        let envContent = '';
        
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            console.log('⚠️  Файл .env не найден, создаем новый');
        }
        
        // Обновляем или добавляем MIN_POINTS_FILTER
        const lines = envContent.split('\n');
        let updated = false;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('MIN_POINTS_FILTER=')) {
                lines[i] = `MIN_POINTS_FILTER=${value}`;
                updated = true;
                break;
            }
        }
        
        if (!updated) {
            lines.push(`MIN_POINTS_FILTER=${value}`);
        }
        
        // Сохраняем файл
        fs.writeFileSync(envPath, lines.join('\n'));
        
        console.log(`✅ Фильтр очков обновлен: ${value}`);
        console.log('🔄 Перезапустите сервис для применения изменений');
        
    } catch (error) {
        console.log('❌ Ошибка обновления фильтра:', error.message);
    }
}

async function handleDuplicateCheck(action) {
    const fs = await import('fs');
    
    if (!action) {
        // Показываем текущее состояние
        const currentValue = process.env.CHECK_DUPLICATES;
        const isEnabled = currentValue === 'true';
        
        console.log('\n🔍 ПРОВЕРКА ДУБЛИКАТОВ:');
        console.log(`Статус: ${isEnabled ? '✅ ВКЛЮЧЕНА' : '❌ ОТКЛЮЧЕНА'}`);
        console.log('');
        console.log('Логика проверки:');
        console.log('  📝 Проверяется: игрок + очки + день (без времени)');
        console.log('  ⏭️  Если дубликат найден - запись пропускается');
        console.log('  💾 Если дубликата нет - запись сохраняется');
        console.log('');
        console.log('Управление:');
        console.log('  npm run duplicate-check on     - Включить проверку');
        console.log('  npm run duplicate-check off    - Отключить проверку');
        return;
    }
    
    let newValue;
    switch (action.toLowerCase()) {
        case 'on':
        case 'enable':
        case 'true':
            newValue = 'true';
            break;
        case 'off':
        case 'disable':
        case 'false':
            newValue = 'false';
            break;
        default:
            console.log('❌ Неверный параметр. Используйте: on/off');
            return;
    }
    
    try {
        // Читаем .env файл
        const envPath = '.env';
        let envContent = '';
        
        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            console.log('⚠️  Файл .env не найден, создаем новый');
        }
        
        // Обновляем или добавляем CHECK_DUPLICATES
        const lines = envContent.split('\n');
        let updated = false;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('CHECK_DUPLICATES=')) {
                lines[i] = `CHECK_DUPLICATES=${newValue}`;
                updated = true;
                break;
            }
        }
        
        if (!updated) {
            lines.push(`CHECK_DUPLICATES=${newValue}`);
        }
        
        // Сохраняем файл
        fs.writeFileSync(envPath, lines.join('\n'));
        
        const isEnabled = newValue === 'true';
        console.log(`✅ Проверка дубликатов: ${isEnabled ? 'ВКЛЮЧЕНА' : 'ОТКЛЮЧЕНА'}`);
        console.log('🔄 Перезапустите сервис для применения изменений');
        
        if (isEnabled) {
            console.log('');
            console.log('💡 Теперь система будет пропускать записи с одинаковыми:');
            console.log('   - Именем игрока');
            console.log('   - Количеством очков');
            console.log('   - Датой (без учета времени)');
        }
        
    } catch (error) {
        console.log('❌ Ошибка обновления настройки:', error.message);
    }
}

async function manageScrapingLogs(subCommand, ...args) {
    const { default: ScrapingLogger } = await import('./database/scrapingLogger.js');
    const scrapingLogger = new ScrapingLogger();
    
    try {
        switch (subCommand) {
            case 'recent':
                const limit = parseInt(args[0]) || 20;
                const recentLogs = await scrapingLogger.getRecentLogs(limit);
                
                console.log(`\n📊 Последние ${limit} записей логов скрапинга:\n`);
                console.log('┌─────┬────────────┬──────────┬───────┬─────────┬───────────┬─────────┬──────────────┬──────────┐');
                console.log('│ ID  │ Дата       │ Время    │ Лимит │ Найдено │ Сохранено │ Успех   │ Время (мс)   │ Ошибка   │');
                console.log('├─────┼────────────┼──────────┼───────┼─────────┼───────────┼─────────┼──────────────┼──────────┤');
                
                recentLogs.forEach(log => {
                    const success = log.database_success ? '✅' : '❌';
                    const error = log.error_message ? log.error_message.substring(0, 10) + '...' : '-';
                    const execTime = log.execution_time_ms || '-';
                    const scrapingDate = new Date(log.scraping_date).toISOString().split('T')[0];
                    
                    console.log(`│ ${log.id.toString().padEnd(3)} │ ${scrapingDate} │ ${log.scraping_time} │ ${log.limit_value.padEnd(5)} │ ${log.players_found.toString().padEnd(7)} │ ${log.players_saved.toString().padEnd(9)} │ ${success.padEnd(7)} │ ${execTime.toString().padEnd(12)} │ ${error.padEnd(8)} │`);
                });
                
                console.log('└─────┴────────────┴──────────┴───────┴─────────┴───────────┴─────────┴──────────────┴──────────┘');
                break;
                
            case 'stats':
                const days = parseInt(args[0]) || 7;
                const limitValue = args[1] || null;
                const stats = await scrapingLogger.getScrapingStats(limitValue, days);
                
                console.log(`\n📈 Статистика скрапинга за последние ${days} дней${limitValue ? ` для лимита ${limitValue}€` : ''}:\n`);
                
                if (stats.length === 0) {
                    console.log('❌ Нет данных за указанный период');
                    break;
                }
                
                console.log('┌────────────┬───────┬─────────┬─────────┬───────────┬─────────┬─────────┬─────────────┐');
                console.log('│ Дата       │ Лимит │ Запуски │ Найдено │ Сохранено │ Успешно │ Ошибки  │ Ср.время(мс)│');
                console.log('├────────────┼───────┼─────────┼─────────┼───────────┼─────────┼─────────┼─────────────┤');
                
                stats.forEach(stat => {
                    const avgTime = stat.avg_execution_time ? Math.round(stat.avg_execution_time) : '-';
                    const scrapingDate = new Date(stat.scraping_date).toISOString().split('T')[0];
                    console.log(`│ ${scrapingDate} │ ${stat.limit_value.padEnd(5)} │ ${stat.total_runs.toString().padEnd(7)} │ ${stat.total_players_found.toString().padEnd(7)} │ ${stat.total_players_saved.toString().padEnd(9)} │ ${stat.successful_runs.toString().padEnd(7)} │ ${stat.failed_runs.toString().padEnd(7)} │ ${avgTime.toString().padEnd(11)} │`);
                });
                
                console.log('└────────────┴───────┴─────────┴─────────┴───────────┴─────────┴─────────┴─────────────┘');
                break;
                
            case 'cleanup':
                const cleanupDays = parseInt(args[0]) || 30;
                const deleted = await scrapingLogger.cleanupOldLogs(cleanupDays);
                console.log(`\n🧹 Очистка логов: удалено ${deleted} записей старше ${cleanupDays} дней`);
                break;
                
            default:
                console.log('\n📊 Команды для работы с логами скрапинга:');
                console.log('  npm run logs recent [limit]     - Последние записи (по умолчанию 20)');
                console.log('  npm run logs stats [days] [limit] - Статистика за период (по умолчанию 7 дней)');
                console.log('  npm run logs cleanup [days]     - Очистка старых логов (по умолчанию 30 дней)');
                console.log('\nПримеры:');
                console.log('  npm run logs recent 50          - Последние 50 записей');
                console.log('  npm run logs stats 14 100       - Статистика за 14 дней для лимита 100€');
                console.log('  npm run logs cleanup 60         - Удалить логи старше 60 дней');
        }
        
    } catch (error) {
        console.error('❌ Ошибка при работе с логами:', error.message);
    } finally {
        await scrapingLogger.disconnect();
    }
    
    process.exit(0);
}

// Экспортируем функцию для использования в server.js
export async function runFullScraping() {
    const startTimeUTC = new Date().toISOString();
    logger.info(`⏰ Время запуска скрапера (UTC): ${startTimeUTC}`);
    
    const scraper = new WinamaxScraper();
    const database = new MySQLService();
    
    try {
        await scraper.initialize();
        await database.connect();
        
        // Получаем активные лимиты
        const limitsConfig = scraper.getActiveLimitsConfig();
        const activeLimits = Object.keys(limitsConfig).filter(limit => limitsConfig[limit].active);
        
        if (activeLimits.length === 0) {
            logger.warn('❌ Нет активных лимитов для сбора');
            return { success: false, error: 'Нет активных лимитов' };
        }
        
        logger.info(`📈 Сбор данных для ${activeLimits.length} лимитов: ${activeLimits.join(', ')}`);
        
        // Добавляем поле scraped_date_milan если его нет
        await database.addMilanDateColumn();
        
        // Собираем данные
        const scrapingResult = await scraper.scrapeAllLimits(limitsConfig);
        const { players: playersData, scrapingResults } = scrapingResult;
        
        if (playersData.length === 0) {
            logger.warn('⚠️ Нет данных для сохранения');
            
            // Логируем пустые результаты
            const dbResults = {};
            activeLimits.forEach(limit => {
                dbResults[limit] = { success: true, insertedCount: 0, duplicatesCount: 0 };
            });
            await scraper.logScrapingResults(scrapingResults, dbResults);
            
            return { success: true, processed: 0, inserted: 0, skipped: 0 };
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
                scraped_at: player.scraped_at || new Date()
            });
        });
        
        // Сохраняем данные по каждому лимиту отдельно и собираем результаты
        const dbResults = {};
        let totalInserted = 0;
        let totalSkipped = 0;
        
        for (const [limitName, limitData] of Object.entries(dataByLimit)) {
            try {
                const result = await database.insertTournamentSnapshot(limitData);
                dbResults[limitName] = result;
                totalInserted += result.insertedCount;
                totalSkipped += result.duplicatesCount;
            } catch (error) {
                logger.error(`Ошибка сохранения лимита ${limitName}:`, error);
                dbResults[limitName] = {
                    success: false,
                    insertedCount: 0,
                    duplicatesCount: 0,
                    error: error.message
                };
            }
        }
        
        // Логируем результаты ПОСЛЕ сохранения в БД
        await scraper.logScrapingResults(scrapingResults, dbResults);
        
        return {
            success: true,
            processed: playersData.length,
            inserted: totalInserted,
            skipped: totalSkipped,
            limits: activeLimits
        };
        
    } catch (error) {
        logger.error('❌ Ошибка полного сбора:', error);
        return { success: false, error: error.message };
    } finally {
        await scraper.close();
        await database.close();
    }
}

// Запускаем main только если файл запущен напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
} 