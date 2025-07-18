import dotenv from 'dotenv';
import telegramNotifier from './src/utils/telegramNotifier.js';

// Загружаем переменные окружения
dotenv.config();

async function testTelegramNotifications() {
    console.log('🧪 Тестирование Telegram уведомлений...');
    
    try {
        // Тест 1: Уведомление о запуске сервера
        console.log('📤 Отправка уведомления о запуске сервера...');
        await telegramNotifier.sendServerStarted();
        
        // Тест 2: Уведомление об ошибке скрапинга
        console.log('📤 Отправка уведомления об ошибке скрапинга...');
        await telegramNotifier.sendScrapingError('Тестовая ошибка скрапинга', '100€');
        
        // Тест 3: Уведомление об ошибке БД
        console.log('📤 Отправка уведомления об ошибке БД...');
        await telegramNotifier.sendDatabaseError('Тестовая ошибка подключения к MySQL');
        
        // Тест 4: Статистика скрапинга
        console.log('📤 Отправка статистики скрапинга...');
        await telegramNotifier.sendScrapingStats({
            successfulRuns: 15,
            failedRuns: 2,
            totalRuns: 17
        });
        
        console.log('✅ Все тесты Telegram уведомлений выполнены успешно!');
        
    } catch (error) {
        console.error('❌ Ошибка тестирования Telegram уведомлений:', error);
    }
}

// Запускаем тест
testTelegramNotifications(); 