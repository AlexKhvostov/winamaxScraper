import winston from 'winston';
import { config } from '../config/config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Кастомный формат для логов
const customFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
});

export const logger = winston.createLogger({
    level: config.logging.level,
    format: combine(
        errors({ stack: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        customFormat
    ),
    transports: [
        // Консольный вывод с цветами
        new winston.transports.Console({
            format: combine(
                colorize(),
                timestamp({ format: 'HH:mm:ss' }),
                printf(({ level, message, timestamp, stack }) => {
                    return `${timestamp} ${level}: ${stack || message}`;
                })
            )
        }),
        
        // Файл для всех логов
        new winston.transports.File({
            filename: 'logs/combined.log',
            format: combine(
                timestamp(),
                customFormat
            )
        }),
        
        // Отдельный файл для ошибок
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: combine(
                timestamp(),
                customFormat
            )
        })
    ]
});

// Создаем директорию для логов если её нет
import { mkdirSync } from 'fs';
try {
    mkdirSync('logs', { recursive: true });
} catch (error) {
    // Директория уже существует
} 