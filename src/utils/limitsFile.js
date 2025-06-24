import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { EXPRESSO_LIMITS } from '../config/limits.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIMITS_FILE = path.join(__dirname, '..', '..', 'limits.txt');

/**
 * Читает активные лимиты из файла
 * @returns {Array} массив кодов лимитов
 */
export function loadLimitsFromFile() {
    try {
        if (!fs.existsSync(LIMITS_FILE)) {
            logger.info('Файл limits.txt не найден, создаем с текущими настройками');
            createLimitsFile();
            return [];
        }

        const content = fs.readFileSync(LIMITS_FILE, 'utf8');
        const lines = content.split('\n');
        
        const limits = lines
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .filter(line => line.length > 0)
            .filter(line => EXPRESSO_LIMITS[line]); // Проверяем что лимит существует

        logger.info(`Загружены лимиты из файла: ${limits.length} активных`);
        return limits;
    } catch (error) {
        logger.error('Ошибка чтения limits.txt:', error);
        return [];
    }
}

/**
 * Проверяет, используются ли лимиты из файла
 * @returns {boolean}
 */
export function isLimitsFileActive() {
    const limits = loadLimitsFromFile();
    return limits.length > 0;
}

/**
 * Получает активные лимиты (из файла или из .env)
 * @returns {Array} массив объектов лимитов
 */
export function getActiveLimitsFromFile() {
    const limitsFromFile = loadLimitsFromFile();
    
    if (limitsFromFile.length === 0) {
        // Используем настройки из .env
        const envLimits = (process.env.ACTIVE_LIMITS || '100').split(',').map(l => l.trim());
        logger.info('Используются лимиты из .env файла');
        
        return envLimits
            .filter(limit => EXPRESSO_LIMITS[limit])
            .map(limit => ({
                limit,
                name: EXPRESSO_LIMITS[limit].name,
                url: EXPRESSO_LIMITS[limit].url,
                description: EXPRESSO_LIMITS[limit].description,
                source: 'env'
            }));
    }

    // Используем лимиты из файла
    return limitsFromFile.map(limit => ({
        limit,
        name: EXPRESSO_LIMITS[limit].name,
        url: EXPRESSO_LIMITS[limit].url,
        description: EXPRESSO_LIMITS[limit].description,
        source: 'file'
    }));
}

/**
 * Добавляет лимит в файл (раскомментирует или добавляет)
 * @param {string} limitCode 
 */
export function addLimitToFile(limitCode) {
    try {
        if (!EXPRESSO_LIMITS[limitCode]) {
            logger.error(`Неизвестный лимит: ${limitCode}`);
            return false;
        }

        const content = fs.readFileSync(LIMITS_FILE, 'utf8');
        const lines = content.split('\n');
        
        // Ищем закомментированную строку с этим лимитом
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === `# ${limitCode}`) {
                lines[i] = limitCode; // Раскомментируем
                found = true;
                break;
            }
        }

        if (!found) {
            // Добавляем в конец перед комментариями
            const insertIndex = lines.findIndex(line => 
                line.includes('Если все строки закомментированы')
            );
            
            if (insertIndex > 0) {
                lines.splice(insertIndex - 1, 0, limitCode);
            } else {
                lines.push(limitCode);
            }
        }

        fs.writeFileSync(LIMITS_FILE, lines.join('\n'), 'utf8');
        logger.info(`Лимит ${limitCode} активирован в файле`);
        return true;
    } catch (error) {
        logger.error('Ошибка добавления лимита в файл:', error);
        return false;
    }
}

/**
 * Удаляет лимит из файла (комментирует)
 * @param {string} limitCode 
 */
export function removeLimitFromFile(limitCode) {
    try {
        const content = fs.readFileSync(LIMITS_FILE, 'utf8');
        const lines = content.split('\n');
        
        // Ищем активную строку с этим лимитом
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === limitCode) {
                lines[i] = `# ${limitCode}`; // Комментируем
                found = true;
                break;
            }
        }

        if (found) {
            fs.writeFileSync(LIMITS_FILE, lines.join('\n'), 'utf8');
            logger.info(`Лимит ${limitCode} деактивирован в файле`);
            return true;
        } else {
            logger.warn(`Лимит ${limitCode} не найден в активных`);
            return false;
        }
    } catch (error) {
        logger.error('Ошибка удаления лимита из файла:', error);
        return false;
    }
}

/**
 * Создает файл лимитов с текущими настройками
 */
function createLimitsFile() {
    const currentActiveLimits = (process.env.ACTIVE_LIMITS || '100').split(',').map(l => l.trim());
    
    const content = [
        '# Активные лимиты турниров Expresso',
        '# Раскомментируйте нужные лимиты, закомментируйте ненужные',
        '# Строки начинающиеся с # игнорируются',
        '# Пустые строки игнорируются',
        '',
        '# Микролимиты',
        currentActiveLimits.includes('0.25') ? '0.25' : '# 0.25',
        currentActiveLimits.includes('0.5') ? '0.5' : '# 0.5',
        '',
        '# Низкие лимиты',
        currentActiveLimits.includes('1-1.5') ? '1-1.5' : '# 1-1.5',
        currentActiveLimits.includes('2-3') ? '2-3' : '# 2-3',
        '',
        '# Средние лимиты',
        currentActiveLimits.includes('4-7') ? '4-7' : '# 4-7',
        currentActiveLimits.includes('8-15') ? '8-15' : '# 8-15',
        '',
        '# Высокие лимиты',
        currentActiveLimits.includes('16-25') ? '16-25' : '# 16-25',
        currentActiveLimits.includes('50') ? '50' : '# 50',
        currentActiveLimits.includes('100') ? '100' : '# 100',
        '',
        '# Премиум лимиты',
        currentActiveLimits.includes('250') ? '250' : '# 250',
        currentActiveLimits.includes('500') ? '500' : '# 500',
        '',
        '# Если все строки закомментированы - будет использоваться настройка из .env файла',
        `# Текущие активные лимиты из .env: ${currentActiveLimits.join(', ')}`
    ];

    fs.writeFileSync(LIMITS_FILE, content.join('\n'), 'utf8');
}

/**
 * Показывает статус лимитов
 */
export function printLimitsFileStatus() {
    const activeLimits = getActiveLimitsFromFile();
    const allLimits = Object.keys(EXPRESSO_LIMITS);
    
    console.log('\n🎯 СТАТУС ЛИМИТОВ:');
    console.log('==================');
    
    if (activeLimits.length === 0) {
        console.log('❌ Нет активных лимитов');
        return;
    }

    const source = activeLimits[0].source;
    if (source === 'file') {
        console.log('📄 Источник: limits.txt');
    } else {
        console.log('📄 Источник: .env файл (limits.txt пустой)');
    }
    
    console.log(`📊 Активно: ${activeLimits.length} из ${allLimits.length} лимитов`);
    console.log('\n✅ АКТИВНЫЕ ЛИМИТЫ:');
    
    activeLimits.forEach((limitInfo, index) => {
        console.log(`   ${index + 1}. ${limitInfo.name} - ${limitInfo.description}`);
    });
    
    // Показываем неактивные лимиты
    const activeCodes = activeLimits.map(l => l.limit);
    const inactiveLimits = allLimits.filter(code => !activeCodes.includes(code));
    
    if (inactiveLimits.length > 0) {
        console.log('\n❌ НЕАКТИВНЫЕ ЛИМИТЫ:');
        inactiveLimits.forEach(code => {
            const limitInfo = EXPRESSO_LIMITS[code];
            console.log(`   • ${limitInfo.name} - ${limitInfo.description}`);
        });
    }
    
    console.log('\n📋 Команды управления:');
    console.log('   npm start limits-file              - показать статус');
    console.log('   npm start limits-file add "50"     - активировать лимит');
    console.log('   npm start limits-file remove "50"  - деактивировать лимит');
    console.log('   Или отредактируйте файл limits.txt вручную\n');
} 