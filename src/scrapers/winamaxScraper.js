import puppeteer from 'puppeteer';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { getLimitConfig, getActiveLimits } from '../config/limits.js';
import { filterByWhitelist } from '../utils/whitelist.js';
import { getActiveLimitsFromFile, isLimitsFileActive } from '../utils/limitsFile.js';
import ScrapingLogger from '../database/scrapingLogger.js';

export class WinamaxScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        // Получаем минимальный лимит очков из переменной окружения, по умолчанию 5
        this.minPointsFilter = process.env.MIN_POINTS_FILTER !== undefined ? parseInt(process.env.MIN_POINTS_FILTER) : 5;
        this.scrapingLogger = new ScrapingLogger();
    }

    async initialize() {
        try {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });
            this.page = await this.browser.newPage();
            
            // Установка User-Agent
            await this.page.setUserAgent(process.env.USER_AGENT || 
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
            
            // Установка viewport
            await this.page.setViewport({ width: 1920, height: 1080 });
            
            logger.info(`Puppeteer инициализирован. Минимальный фильтр очков: ${this.minPointsFilter}`);
        } catch (error) {
            logger.error('Ошибка инициализации Puppeteer:', error);
            throw error;
        }
    }

    async scrapeLeaderboard(url, limitName) {
        const startTime = Date.now();
        let logId = null;
        
        try {
            // Логируем начало скрапинга
            logId = await this.scrapingLogger.logScrapingStart(limitName);
            
            logger.info(`Начинаем скрапинг ${limitName}: ${url}`);
            
            await this.page.goto(url, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });

            // Ждем загрузки таблицы с данными
            await this.page.waitForSelector('.sc-khIgEk.hQhHpX', { timeout: 15000 });
            
            // Передаем минимальный лимит очков в evaluate
            const minPoints = this.minPointsFilter;
            
            // Извлекаем данные игроков
            const allPlayers = await this.page.evaluate((minPointsFilter) => {
                const playersData = [];
                
                // Находим все строки с игроками
                const playerRows = document.querySelectorAll('.sc-khIgEk.hQhHpX .sc-cOifOu, .sc-khIgEk.hQhHpX .sc-jcwpoC');
                
                playerRows.forEach((row) => {
                    try {
                        // Извлекаем данные из каждой строки
                        const rankElement = row.querySelector('.sc-ciSkZP[color="#ffc514"], .sc-ciSkZP[color="#a1a4b8"]');
                        const nameElement = row.querySelector('.sc-ciSkZP.kqvvUj');
                        const pointsElements = row.querySelectorAll('.sc-ciSkZP.JmAaU');
                        
                        if (rankElement && nameElement && pointsElements.length >= 2) {
                            const rank = parseInt(rankElement.textContent.trim());
                            const name = nameElement.textContent.trim();
                            const points = parseFloat(pointsElements[0].textContent.trim());
                            const guarantee = pointsElements[1].textContent.trim();
                            
                            // Проверяем, что данные валидны И у игрока больше минимального количества очков
                            if (!isNaN(rank) && name && !isNaN(points) && points > minPointsFilter) {
                                playersData.push({
                                    rank,
                                    name,
                                    points,
                                    guarantee: guarantee === '-' ? null : guarantee
                                });
                            }
                        }
                    } catch (error) {
                        console.log('Ошибка парсинга строки:', error);
                    }
                });
                
                return playersData;
            }, minPoints);

            // Подсчитываем реальное количество найденных игроков (без заголовка)
            const totalPlayersFound = allPlayers.length;

            // Применяем whitelist фильтрацию
            const whitelistResult = filterByWhitelist(allPlayers);
            const players = whitelistResult.filtered;

            // Логируем результаты
            if (whitelistResult.whitelistActive) {
                logger.info(`Найдено ${totalPlayersFound} игроков с >${this.minPointsFilter} очками`);
                logger.info(`Whitelist: найдено ${whitelistResult.found} из ${whitelistResult.total} отслеживаемых игроков для лимита ${limitName}`);
                
                if (whitelistResult.missing.length > 0) {
                    logger.warn(`Не найдены в whitelist: ${whitelistResult.missing.join(', ')}`);
                }
            } else {
                logger.info(`Найдено ${totalPlayersFound} игроков с >${this.minPointsFilter} очками, подготовлено ${players.length} для сохранения в лимите ${limitName}`);
            }
            
            if (players.length === 0) {
                const reason = whitelistResult.whitelistActive ? 
                    `игроков из whitelist с >${this.minPointsFilter} очками` : 
                    `игроков с >${this.minPointsFilter} очками`;
                logger.warn(`Не найдено ${reason} для лимита ${limitName}`);
            }

            // Добавляем метаданные к каждому игроку
            const timestamp = new Date();
            const result = players.map(player => ({
                ...player,
                limit: limitName,
                timestamp,
                scraped_at: timestamp
            }));

            // Возвращаем данные с информацией для логирования (БЕЗ логирования здесь!)
            return {
                players: result,
                totalFound: totalPlayersFound,
                logId: logId,
                startTime: startTime
            };

        } catch (error) {
            logger.error(`Ошибка скрапинга лимита ${limitName}:`, error);
            
            // Логируем ошибку
            const executionTime = Date.now() - startTime;
            if (logId) {
                await this.scrapingLogger.logScrapingResult(logId, {
                    playersFound: 0,
                    playersSaved: 0,
                    databaseSuccess: false,
                    errorMessage: error.message,
                    executionTimeMs: executionTime
                });
            }
            
            throw error;
        }
    }

    async scrapeAllLimits(limitsConfig) {
        const allPlayersData = [];
        const scrapingResults = []; // Для хранения результатов каждого лимита

        for (const [limitName, limitConfig] of Object.entries(limitsConfig)) {
            if (!limitConfig.active) {
                logger.info(`Пропускаем неактивный лимит: ${limitName}`);
                continue;
            }

            try {
                const scrapingResult = await this.scrapeLeaderboard(limitConfig.url, limitName);
                allPlayersData.push(...scrapingResult.players);
                
                // Сохраняем информацию для последующего логирования
                scrapingResults.push({
                    limitName: limitName,
                    totalFound: scrapingResult.totalFound,
                    playersReady: scrapingResult.players.length,
                    logId: scrapingResult.logId,
                    startTime: scrapingResult.startTime
                });
                
                // Пауза между запросами
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                logger.error(`Ошибка скрапинга лимита ${limitName}:`, error);
                // Продолжаем с другими лимитами
                continue;
            }
        }

        return {
            players: allPlayersData,
            scrapingResults: scrapingResults
        };
    }

    /**
     * Получает активные лимиты (из файла или из .env)
     * @returns {Object} конфигурация лимитов
     */
    getActiveLimitsConfig() {
        if (isLimitsFileActive()) {
            // Используем лимиты из файла
            const limitsFromFile = getActiveLimitsFromFile();
            logger.info(`Используются лимиты из файла limits.txt: ${limitsFromFile.length} активных`);
            
            const config = {};
            limitsFromFile.forEach(limitInfo => {
                config[limitInfo.limit] = {
                    ...limitInfo,
                    active: true
                };
            });
            return config;
        } else {
            // Используем лимиты из .env (старый способ)
            logger.info('Используются лимиты из .env файла (limits.txt пустой)');
            return getActiveLimits();
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            logger.info('Браузер закрыт');
        }
        
        // Закрываем соединение с БД логов
        if (this.scrapingLogger) {
            await this.scrapingLogger.disconnect();
        }
    }

    // Метод для отладки - сохранение скриншота
    async debugScreenshot(filename = 'debug.png') {
        if (this.page) {
            await this.page.screenshot({ path: filename, fullPage: true });
            logger.info(`Скриншот сохранен: ${filename}`);
        }
    }

    // Метод для получения HTML страницы для отладки
    async getPageHTML() {
        if (this.page) {
            return await this.page.content();
        }
        return null;
    }

    /**
     * Логирует результаты скрапинга ПОСЛЕ сохранения в БД
     * @param {Array} scrapingResults - результаты скрапинга каждого лимита  
     * @param {Object} dbResults - результаты сохранения в БД по лимитам
     */
    async logScrapingResults(scrapingResults, dbResults) {
        for (const scrapingResult of scrapingResults) {
            const { limitName, totalFound, playersReady, logId, startTime } = scrapingResult;
            const dbResult = dbResults[limitName];
            
            if (!logId) continue;
            
            const executionTime = Date.now() - startTime;
            
            if (dbResult && dbResult.success) {
                // Успешное сохранение
                await this.scrapingLogger.logScrapingResult(logId, {
                    playersFound: totalFound,
                    playersSaved: dbResult.insertedCount,
                    databaseSuccess: true,
                    executionTimeMs: executionTime
                });
                
                logger.info(`✅ Лимит ${limitName}: найдено ${totalFound}, сохранено ${dbResult.insertedCount}, пропущено дубликатов ${dbResult.duplicatesCount}`);
            } else {
                // Ошибка сохранения
                const errorMessage = dbResult ? dbResult.error : 'Неизвестная ошибка БД';
                await this.scrapingLogger.logScrapingResult(logId, {
                    playersFound: totalFound,
                    playersSaved: 0,
                    databaseSuccess: false,
                    errorMessage: errorMessage,
                    executionTimeMs: executionTime
                });
                
                logger.error(`❌ Лимит ${limitName}: найдено ${totalFound}, ошибка сохранения - ${errorMessage}`);
            }
        }
    }
} 