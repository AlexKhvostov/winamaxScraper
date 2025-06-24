import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

const WHITELIST_FILE = 'whitelist.txt';

/**
 * Читает whitelist из файла
 * @returns {Array} массив имен игроков
 */
export function loadWhitelist() {
    try {
        if (!fs.existsSync(WHITELIST_FILE)) {
            logger.info('Файл whitelist.txt не найден, создаем пустой');
            createEmptyWhitelist();
            return [];
        }

        const content = fs.readFileSync(WHITELIST_FILE, 'utf8');
        const lines = content.split('\n');
        
        const players = lines
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .filter(line => line.length > 0);

        logger.info(`Загружен whitelist: ${players.length} игроков`);
        return players;
    } catch (error) {
        logger.error('Ошибка чтения whitelist:', error);
        return [];
    }
}

/**
 * Проверяет, активен ли whitelist
 * @returns {boolean}
 */
export function isWhitelistActive() {
    const players = loadWhitelist();
    return players.length > 0;
}

/**
 * Фильтрует игроков по whitelist
 * @param {Array} players - массив всех игроков
 * @returns {Object} результат фильтрации
 */
export function filterByWhitelist(players) {
    const whitelist = loadWhitelist();
    
    if (whitelist.length === 0) {
        return {
            filtered: players,
            whitelistActive: false,
            found: players.length,
            total: players.length,
            missing: []
        };
    }

    // Фильтруем только игроков из whitelist
    const filtered = players.filter(player => 
        whitelist.some(whitelistName => 
            player.name.toLowerCase().includes(whitelistName.toLowerCase()) ||
            whitelistName.toLowerCase().includes(player.name.toLowerCase())
        )
    );

    // Находим игроков из whitelist, которых нет на странице
    const foundNames = filtered.map(p => p.name.toLowerCase());
    const missing = whitelist.filter(whitelistName => 
        !foundNames.some(foundName => 
            foundName.includes(whitelistName.toLowerCase()) ||
            whitelistName.toLowerCase().includes(foundName)
        )
    );

    return {
        filtered,
        whitelistActive: true,
        found: filtered.length,
        total: whitelist.length,
        missing
    };
}

/**
 * Добавляет игрока в whitelist
 * @param {string} playerName 
 */
export function addToWhitelist(playerName) {
    try {
        const whitelist = loadWhitelist();
        
        if (whitelist.includes(playerName)) {
            logger.warn(`Игрок ${playerName} уже в whitelist`);
            return false;
        }

        whitelist.push(playerName);
        saveWhitelist(whitelist);
        logger.info(`Игрок ${playerName} добавлен в whitelist`);
        return true;
    } catch (error) {
        logger.error('Ошибка добавления в whitelist:', error);
        return false;
    }
}

/**
 * Удаляет игрока из whitelist
 * @param {string} playerName 
 */
export function removeFromWhitelist(playerName) {
    try {
        const whitelist = loadWhitelist();
        const index = whitelist.indexOf(playerName);
        
        if (index === -1) {
            logger.warn(`Игрок ${playerName} не найден в whitelist`);
            return false;
        }

        whitelist.splice(index, 1);
        saveWhitelist(whitelist);
        logger.info(`Игрок ${playerName} удален из whitelist`);
        return true;
    } catch (error) {
        logger.error('Ошибка удаления из whitelist:', error);
        return false;
    }
}

/**
 * Очищает whitelist
 */
export function clearWhitelist() {
    try {
        saveWhitelist([]);
        logger.info('Whitelist очищен');
        return true;
    } catch (error) {
        logger.error('Ошибка очистки whitelist:', error);
        return false;
    }
}

/**
 * Сохраняет whitelist в файл
 * @param {Array} players 
 */
function saveWhitelist(players) {
    const header = [
        '# Whitelist игроков для мониторинга',
        '# Один игрок на строку',
        '# Строки начинающиеся с # игнорируются',
        '# Пустые строки игнорируются',
        '',
        '# Если файл пустой или все строки закомментированы - собираются ВСЕ игроки',
        '# Если есть активные имена - собираются ТОЛЬКО они (если найдены на странице)',
        ''
    ];

    const content = header.concat(players).join('\n');
    fs.writeFileSync(WHITELIST_FILE, content, 'utf8');
}

/**
 * Создает пустой whitelist файл
 */
function createEmptyWhitelist() {
    const content = [
        '# Whitelist игроков для мониторинга',
        '# Один игрок на строку',
        '# Строки начинающиеся с # игнорируются',
        '# Пустые строки игнорируются',
        '',
        '# Примеры игроков (раскомментируйте нужных):',
        '# La Magie',
        '# NiclsRobert',
        '# 5.8 BB',
        '# Jas0n_B0urne',
        '# IWLKN',
        '',
        '# Если файл пустой или все строки закомментированы - собираются ВСЕ игроки',
        '# Если есть активные имена - собираются ТОЛЬКО они (если найдены на странице)'
    ].join('\n');

    fs.writeFileSync(WHITELIST_FILE, content, 'utf8');
}

/**
 * Показывает статус whitelist
 */
export function printWhitelistStatus() {
    const whitelist = loadWhitelist();
    
    console.log('\n👥 СТАТУС WHITELIST:');
    console.log('===================');
    
    if (whitelist.length === 0) {
        console.log('📊 Режим: СБОР ВСЕХ ИГРОКОВ');
        console.log('📄 Файл: whitelist.txt (пустой или все закомментировано)');
        console.log('💡 Чтобы активировать whitelist, добавьте имена игроков в файл');
    } else {
        console.log('🎯 Режим: WHITELIST АКТИВЕН');
        console.log(`📊 Отслеживается: ${whitelist.length} игроков`);
        console.log('👥 Список игроков:');
        whitelist.forEach((player, index) => {
            console.log(`   ${index + 1}. ${player}`);
        });
    }
    
    console.log('\n📋 Команды управления:');
    console.log('   npm start whitelist              - показать статус');
    console.log('   npm start whitelist add "Name"   - добавить игрока');
    console.log('   npm start whitelist remove "Name" - удалить игрока');
    console.log('   npm start whitelist clear        - очистить список');
    console.log('   Или отредактируйте файл whitelist.txt вручную\n');
} 