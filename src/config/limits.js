/**
 * Конфигурация лимитов турниров Expresso
 */
import dotenv from 'dotenv';

dotenv.config();

export const EXPRESSO_LIMITS = {
    '0.25': {
        name: '0.25€',
        url: 'https://www.winamax.fr/en/challenges/expresso/0.25/',
        enabled: false,
        description: 'Микролимит 25 центов'
    },
    '0.5': {
        name: '0.50€', 
        url: 'https://www.winamax.fr/en/challenges/expresso/0.5/',
        enabled: false,
        description: 'Микролimит 50 центов'
    },
    '1-1.5': {
        name: '1-1.5€',
        url: 'https://www.winamax.fr/en/challenges/expresso/1-1.5/',
        enabled: false,
        description: 'Низкий лимит 1-1.5€'
    },
    '2-3': {
        name: '2-3€',
        url: 'https://www.winamax.fr/en/challenges/expresso/2-3/',
        enabled: false,
        description: 'Низкий лимит 2-3€'
    },
    '4-7': {
        name: '4-7€',
        url: 'https://www.winamax.fr/en/challenges/expresso/4-7/',
        enabled: false,
        description: 'Средний лимит 4-7€'
    },
    '8-15': {
        name: '8-15€',
        url: 'https://www.winamax.fr/en/challenges/expresso/8-15/',
        enabled: false,
        description: 'Средний лимит 8-15€'
    },
    '16-25': {
        name: '16-25€',
        url: 'https://www.winamax.fr/en/challenges/expresso/16-25/',
        enabled: false, // Будет обновлено из .env
        description: 'Высокий лимит 16-25€'
    },
    '50': {
        name: '50€',
        url: 'https://www.winamax.fr/en/challenges/expresso/50/',
        enabled: false, // Будет обновлено из .env
        description: 'Высокий лимит 50€'
    },
    '100': {
        name: '100€',
        url: 'https://www.winamax.fr/en/challenges/expresso/100/',
        enabled: false, // Будет обновлено из .env
        description: 'Премиум лимит 100€'
    },
    '250': {
        name: '250€',
        url: 'https://www.winamax.fr/en/challenges/expresso/250/',
        enabled: false,
        description: 'Премиум лимит 250€'
    },
    '500': {
        name: '500€',
        url: 'https://www.winamax.fr/en/challenges/expresso/500/',
        enabled: false,
        description: 'Высший лимит 500€'
    }
};

// Инициализируем активные лимиты из переменных окружения
function initializeActiveLimits() {
    const activeLimitsEnv = process.env.ACTIVE_LIMITS || '16-25,50,100';
    const activeLimits = activeLimitsEnv.split(',').map(limit => limit.trim());
    
    // Сначала отключаем все лимиты
    Object.keys(EXPRESSO_LIMITS).forEach(limit => {
        EXPRESSO_LIMITS[limit].enabled = false;
    });
    
    // Затем включаем только активные
    activeLimits.forEach(limit => {
        if (EXPRESSO_LIMITS[limit]) {
            EXPRESSO_LIMITS[limit].enabled = true;
        }
    });
}

// Инициализируем при загрузке модуля
initializeActiveLimits();

/**
 * Получает список активных лимитов
 * @returns {Array} массив активных лимитов
 */
export function getActiveLimits() {
    return Object.entries(EXPRESSO_LIMITS)
        .filter(([_, config]) => config.enabled)
        .map(([limit, config]) => ({
            limit,
            name: config.name,
            url: config.url,
            description: config.description
        }));
}

/**
 * Получает конфигурацию конкретного лимита
 * @param {string} limit - код лимита
 * @returns {Object|null} конфигурация лимита
 */
export function getLimitConfig(limit) {
    return EXPRESSO_LIMITS[limit] || null;
}

/**
 * Проверяет, активен ли лимит
 * @param {string} limit - код лимита
 * @returns {boolean} активен ли лимит
 */
export function isLimitEnabled(limit) {
    const config = getLimitConfig(limit);
    return config ? config.enabled : false;
}

/**
 * Включает/отключает лимит (временно, до перезапуска)
 * @param {string} limit - код лимита
 * @param {boolean} enabled - включить или отключить
 */
export function setLimitEnabled(limit, enabled) {
    if (EXPRESSO_LIMITS[limit]) {
        EXPRESSO_LIMITS[limit].enabled = enabled;
        return true;
    }
    return false;
}

/**
 * Получает все лимиты (включенные и отключенные)
 * @returns {Array} все лимиты
 */
export function getAllLimits() {
    return Object.entries(EXPRESSO_LIMITS).map(([limit, config]) => ({
        limit,
        name: config.name,
        url: config.url,
        enabled: config.enabled,
        description: config.description
    }));
}

/**
 * Получает массив всех кодов лимитов в правильном порядке
 * @returns {Array} массив кодов лимитов
 */
export function getAllLimitCodes() {
    return ['0.25', '0.5', '1-1.5', '2-3', '4-7', '8-15', '16-25', '50', '100', '250', '500'];
}

/**
 * Выводит статус всех лимитов
 */
export function printLimitsStatus() {
    console.log('\n📊 СТАТУС ЛИМИТОВ EXPRESSO:');
    console.log('===============================');
    
    const allLimits = getAllLimits();
    allLimits.forEach(limitInfo => {
        const status = limitInfo.enabled ? '✅ АКТИВЕН' : '❌ ОТКЛЮЧЕН';
        console.log(`${status.padEnd(12)} ${limitInfo.name.padEnd(8)} - ${limitInfo.description}`);
    });
    
    const activeLimits = getActiveLimits();
    console.log(`\n🎯 Активно лимитов: ${activeLimits.length} из ${allLimits.length}`);
    console.log(`📋 Активные: ${activeLimits.map(l => l.name).join(', ')}\n`);
} 