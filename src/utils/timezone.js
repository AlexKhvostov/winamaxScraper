/**
 * Утилиты для работы с часовым поясом Милана
 * Учитывает сброс очков в полночь по времени Милана
 */

/**
 * Получает текущую дату и время в часовом поясе Милана
 * @returns {Date} Дата в часовом поясе Милана
 */
export function getMilanTime() {
    const timezone = process.env.TIMEZONE || 'Europe/Rome';
    
    // Создаем дату в часовом поясе Милана
    const milanDate = new Date().toLocaleString("en-US", {
        timeZone: timezone
    });
    
    return new Date(milanDate);
}

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
 * Проверяет, произошел ли переход через полночь между двумя датами
 * @param {Date} date1 - первая дата
 * @param {Date} date2 - вторая дата
 * @returns {boolean} true если даты в разных днях по времени Милана
 */
export function isMidnightCrossed(date1, date2) {
    const milanDate1 = getMilanDateOnly(date1);
    const milanDate2 = getMilanDateOnly(date2);
    
    return milanDate1 !== milanDate2;
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
 * Вычисляет разность очков с учетом возможного сброса в полночь
 * @param {number} currentPoints - текущие очки
 * @param {number} previousPoints - предыдущие очки
 * @param {Date} currentDate - дата текущих очков
 * @param {Date} previousDate - дата предыдущих очков
 * @returns {number} Разность очков (положительная или 0)
 */
export function calculatePointsDifference(currentPoints, previousPoints, currentDate, previousDate) {
    const handleMidnightReset = process.env.HANDLE_MIDNIGHT_RESET === 'true';
    
    if (!handleMidnightReset) {
        return currentPoints - previousPoints;
    }
    
    // Проверяем, произошел ли переход через полночь
    const midnightCrossed = isMidnightCrossed(previousDate, currentDate);
    
    if (midnightCrossed) {
        // Если переход через полночь, считаем что очки сбросились
        // Возвращаем только текущие очки (как будто предыдущих было 0)
        return currentPoints;
    }
    
    // Обычная разность
    const difference = currentPoints - previousPoints;
    
    // Если разность отрицательная и большая, возможно был сброс
    if (difference < -100) {
        // Вероятно произошел сброс, возвращаем текущие очки
        return currentPoints;
    }
    
    return Math.max(0, difference); // Не возвращаем отрицательные значения
}

/**
 * Форматирует дату для логов в часовом поясе Милана
 * @param {Date} date - дата для форматирования (опционально)
 * @returns {string} Форматированная дата
 */
export function formatMilanDate(date = null) {
    const targetDate = date || new Date();
    return `${getMilanDateTime(targetDate)} (Milan time)`;
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