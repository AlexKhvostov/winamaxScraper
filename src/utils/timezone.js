/**
 * Утилиты для работы с часовым поясом Милана
 * Учитывает сброс очков в полночь по времени Милана
 */



/**
 * Получает дату в часовом поясе Милана без времени (только дата)
 * @param {Date} date - дата для конвертации (опционально)
 * @returns {string} Дата в формате YYYY-MM-DD
 */
export function getMilanDateOnly(date = null) {
    const timezone = process.env.TIMEZONE || 'Europe/Rome';
    const targetDate = date || new Date();
    
    // Получаем дату в часовом поясе Милана
    const milanDateStr = targetDate.toLocaleDateString("en-CA", {
        timeZone: timezone
    });
    
    return milanDateStr; // Формат YYYY-MM-DD
}



/**
 * Получает время в часовом поясе Милана в формате HH:MM:SS
 * @param {Date} date - дата для конвертации (опционально)
 * @returns {string} Время в формате HH:MM:SS
 */
export function getMilanTimeOnly(date = null) {
    const timezone = process.env.TIMEZONE || 'Europe/Rome';
    const targetDate = date || new Date();
    
    return targetDate.toLocaleTimeString("en-GB", {
        timeZone: timezone,
        hour12: false
    });
}

/**
 * Получает полную дату и время в часовом поясе Милана
 * @param {Date} date - дата для конвертации (опционально)
 * @returns {string} Дата и время в формате YYYY-MM-DD HH:MM:SS
 */
export function getMilanDateTime(date = null) {
    const timezone = process.env.TIMEZONE || 'Europe/Rome';
    const targetDate = date || new Date();
    
    const milanDate = getMilanDateOnly(targetDate);
    const milanTime = getMilanTimeOnly(targetDate);
    
    return `${milanDate} ${milanTime}`;
}

/**
 * Проверяет, близко ли время к полуночи (в пределах 30 минут)
 * Полезно для определения возможного сброса очков
 * @param {Date} date - дата для проверки (опционально)
 * @returns {boolean} true если время близко к полуночи
 */
export function isNearMidnight(date = null) {
    const timezone = process.env.TIMEZONE || 'Europe/Rome';
    const targetDate = date || new Date();
    
    const milanTime = targetDate.toLocaleString("en-US", {
        timeZone: timezone,
        hour12: false
    });
    
    const hour = parseInt(milanTime.split(' ')[1].split(':')[0]);
    const minute = parseInt(milanTime.split(' ')[1].split(':')[1]);
    
    // Близко к полуночи: 23:30-23:59 или 00:00-00:30
    return (hour === 23 && minute >= 30) || (hour === 0 && minute <= 30);
}



/**
 * Получает информацию о часовом поясе
 * @returns {object} Информация о часовом поясе
 */
export function getTimezoneInfo() {
    const timezone = process.env.TIMEZONE || 'Europe/Rome';
    const now = new Date();
    
    return {
        timezone,
        currentTime: getMilanDateTime(),
        currentDate: getMilanDateOnly(),
        isNearMidnight: isNearMidnight(),
        utcOffset: now.getTimezoneOffset()
    };
} 