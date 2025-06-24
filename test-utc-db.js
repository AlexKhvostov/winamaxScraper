import { MySQLService } from './src/database/mysql.js';

async function testUTCTime() {
    const database = new MySQLService();
    
    try {
        await database.connect();
        
        console.log('🔍 Проверяем время в БД...\n');
        
        // Проверяем последние записи в логах скрапинга
        const [scrapingLogs] = await database.pool.execute(`
            SELECT id, scraping_date, scraping_time, scraping_datetime, created_at
            FROM scraping_logs 
            ORDER BY id DESC 
            LIMIT 3
        `);
        
        console.log('📊 Последние записи в логах скрапинга:');
        scrapingLogs.forEach(log => {
            console.log(`ID: ${log.id}`);
            console.log(`  Дата: ${log.scraping_date} (UTC: ${new Date(log.scraping_date).toISOString()})`);
            console.log(`  Время: ${log.scraping_time}`);
            console.log(`  Datetime: ${log.scraping_datetime} (UTC: ${new Date(log.scraping_datetime).toISOString()})`);
            console.log(`  Created_at: ${log.created_at} (UTC: ${new Date(log.created_at).toISOString()})`);
            console.log('');
        });
        
        // Проверяем последние записи игроков
        const [playerRecords] = await database.pool.execute(`
            SELECT id, player_name, scraped_at, scraped_date_milan
            FROM tournament_snapshots 
            ORDER BY id DESC 
            LIMIT 5
        `);
        
        console.log('🎮 Последние записи игроков:');
        playerRecords.forEach(record => {
            console.log(`ID: ${record.id} | ${record.player_name}`);
            console.log(`  Scraped_at: ${record.scraped_at} (UTC: ${new Date(record.scraped_at).toISOString()})`);
            console.log(`  Milan date: ${record.scraped_date_milan} (UTC: ${new Date(record.scraped_date_milan).toISOString()})`);
            console.log('');
        });
        
        // Проверяем текущее время сервера БД
        const [serverTime] = await database.pool.execute('SELECT NOW() as local_time, UTC_TIMESTAMP() as utc_time');
        console.log('⏰ Время сервера БД:');
        console.log(`  Local: ${serverTime[0].local_time}`);
        console.log(`  UTC: ${serverTime[0].utc_time}`);
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        await database.close();
    }
}

testUTCTime(); 