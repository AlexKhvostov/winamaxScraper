import dotenv from 'dotenv';

dotenv.config();

export const config = {
    database: {
        type: process.env.DB_TYPE || 'mysql',
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        username: process.env.MYSQL_USERNAME || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'winamax_analytics'
    },
    scraping: {
        intervalMinutes: parseInt(process.env.SCRAPING_INTERVAL_MINUTES) || 10,
        userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    }
}; 