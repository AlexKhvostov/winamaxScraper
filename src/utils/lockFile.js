import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Утилита для предотвращения параллельных запусков скрапера
 */

const LOCK_FILE_PATH = path.join(process.cwd(), 'scraper.lock');

/**
 * Создает lock файл для предотвращения параллельных запусков
 * @returns {boolean} true если lock файл успешно создан
 */
export function createLockFile() {
    try {
        if (fs.existsSync(LOCK_FILE_PATH)) {
            // Проверяем, не устарел ли lock файл (старше 30 минут)
            const stats = fs.statSync(LOCK_FILE_PATH);
            const lockAge = Date.now() - stats.mtime.getTime();
            const maxLockAge = 30 * 60 * 1000; // 30 минут
            
            if (lockAge > maxLockAge) {
                logger.warn('Lock файл устарел, удаляем его');
                fs.unlinkSync(LOCK_FILE_PATH);
            } else {
                logger.warn('Скрапер уже запущен (найден lock файл)');
                return false;
            }
        }
        
        // Создаем lock файл с информацией о процессе
        const lockData = {
            pid: process.pid,
            startTime: new Date().toISOString(),
            command: process.argv.join(' ')
        };
        
        fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(lockData, null, 2));
        logger.info('Lock файл создан');
        return true;
    } catch (error) {
        logger.error('Ошибка создания lock файла:', error);
        return false;
    }
}

/**
 * Удаляет lock файл
 */
export function removeLockFile() {
    try {
        if (fs.existsSync(LOCK_FILE_PATH)) {
            fs.unlinkSync(LOCK_FILE_PATH);
            logger.info('Lock файл удален');
        }
    } catch (error) {
        logger.error('Ошибка удаления lock файла:', error);
    }
}

/**
 * Проверяет, запущен ли уже скрапер
 * @returns {boolean} true если скрапер уже запущен
 */
export function isScraperRunning() {
    try {
        if (!fs.existsSync(LOCK_FILE_PATH)) {
            return false;
        }
        
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8'));
        const lockAge = Date.now() - new Date(lockData.startTime).getTime();
        const maxLockAge = 30 * 60 * 1000; // 30 минут
        
        if (lockAge > maxLockAge) {
            logger.warn('Lock файл устарел, скрапер вероятно завис');
            removeLockFile();
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error('Ошибка проверки lock файла:', error);
        return false;
    }
}

/**
 * Получает информацию о запущенном скрапере
 * @returns {object|null} Информация о процессе или null
 */
export function getLockInfo() {
    try {
        if (!fs.existsSync(LOCK_FILE_PATH)) {
            return null;
        }
        
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8'));
        return lockData;
    } catch (error) {
        logger.error('Ошибка чтения lock файла:', error);
        return null;
    }
}

/**
 * Устанавливает обработчики для автоматического удаления lock файла
 */
export function setupLockFileCleanup() {
    // Удаляем lock файл при завершении процесса
    process.on('exit', removeLockFile);
    process.on('SIGINT', () => {
        logger.info('Получен сигнал SIGINT, завершаем работу...');
        removeLockFile();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        logger.info('Получен сигнал SIGTERM, завершаем работу...');
        removeLockFile();
        process.exit(0);
    });
    process.on('uncaughtException', (error) => {
        logger.error('Необработанная ошибка:', error);
        removeLockFile();
        process.exit(1);
    });
} 