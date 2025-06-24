import dotenv from 'dotenv';

dotenv.config();

export const config = {
    mysql: {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USERNAME || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'winamax_analytics',
        charset: 'utf8mb4',
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true
    }
}; 