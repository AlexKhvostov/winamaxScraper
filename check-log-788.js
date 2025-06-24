import { MySQLService } from './src/database/mysql.js';

async function checkLog788() {
    const database = new MySQLService();
    
    try {
        await database.connect();
        
        console.log('🔍 Проверяем все записи с ID 788...\n');
        
        // Проверяем все записи с ID 788
        const [logs] = await database.pool.execute(`
            SELECT id, scraping_date, scraping_time, scraping_datetime, limit_value, players_found, players_saved, database_success
            FROM scraping_logs 
            WHERE id = 788
            ORDER BY id, limit_value
        `);
        
        console.log(`📊 Найдено ${logs.length} записей с ID 788:`);
        logs.forEach(log => {
            console.log(`ID: ${log.id}`);
            console.log(`  Дата: ${log.scraping_date}`);
            console.log(`  Время: ${log.scraping_time}`);
            console.log(`  Datetime: ${log.scraping_datetime}`);
            console.log(`  Лимит: ${log.limit_value}`);
            console.log(`  Найдено: ${log.players_found}`);
            console.log(`  Сохранено: ${log.players_saved}`);
            console.log(`  Успех: ${log.database_success}`);
            console.log('');
        });
        
        // Проверяем все записи с похожим временем
        const [similarLogs] = await database.pool.execute(`
            SELECT id, scraping_date, scraping_time, scraping_datetime, limit_value, players_found, players_saved, database_success
            FROM scraping_logs 
            WHERE scraping_datetime BETWEEN '2025-06-24 18:20:00' AND '2025-06-24 18:22:00'
            ORDER BY id, limit_value
        `);
        
        console.log(`📊 Все записи с временем 18:20-18:22 (${similarLogs.length} записей):`);
        similarLogs.forEach(log => {
            console.log(`ID: ${log.id} | Лимит: ${log.limit_value} | Найдено: ${log.players_found} | Сохранено: ${log.players_saved} | Время: ${log.scraping_time}`);
        });
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        await database.close();
    }
}

checkLog788(); 