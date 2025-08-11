#!/usr/bin/env node

import { exec, spawn } from 'child_process';
import { logger } from './src/utils/logger.js';
import fetch from 'node-fetch';
import express from 'express';

class ServerWatchdog {
    constructor() {
        this.serverUrl = process.env.WATCHDOG_SERVER_URL || 'http://localhost:3000/api/status';
        this.checkInterval = 180000; // Проверка каждые 3 минуты
        this.debugMode = true;
        this.maxRestarts = 5; // Максимум перезапусков в час
        this.restartWindow = 3600000; // Окно в 1 час
        this.isRunning = false;
        this.restartCount = 0;
        this.lastRestartTime = null;
        this.lastCheckTime = null;
        this.lastServerStatus = null;
        
        // Express сервер для статуса
        this.app = express();
        this.statusPort = 3001;
        this.setupStatusServer();
    }

    setupStatusServer() {
        // Endpoint для проверки статуса watchdog
        this.app.get('/api/status', (req, res) => {
            const status = {
                status: 'running',
                service: 'Server Watchdog',
                time: new Date().toISOString(),
                milanTime: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Rome' }),
                isRunning: this.isRunning,
                lastCheckTime: this.lastCheckTime,
                lastServerStatus: this.lastServerStatus,
                restartCount: this.restartCount,
                lastRestartTime: this.lastRestartTime,
                checkInterval: this.checkInterval,
                serverUrl: this.serverUrl,
                uptime: process.uptime(),
                memory: process.memoryUsage().heapUsed / 1024 / 1024
            };
            
            res.json(status);
        });

        // Запускаем сервер статуса
        this.app.listen(this.statusPort, () => {
            logger.info(`📊 Watchdog status server запущен на порту ${this.statusPort}`);
            logger.info(`🔗 Статус доступен по адресу: http://localhost:${this.statusPort}/api/status`);
        });
    }

    async start() {
        logger.info('🐕 Запуск Watchdog для мониторинга сервера...');
        this.isRunning = true;
        
        // Запускаем сервер если он не запущен
        await this.ensureServerRunning();
        
        // Запускаем мониторинг
        this.monitorLoop();
        
        // Graceful shutdown
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
        
        logger.info('✅ Watchdog запущен и мониторит сервер');
        logger.info(`🔍 Проверка каждые ${this.checkInterval / 1000 / 60} минут`);
    }

    async stop() {
        logger.info('🛑 Остановка Watchdog...');
        this.isRunning = false;
        process.exit(0);
    }

    async monitorLoop() {
        if (!this.isRunning) return;

        try {
            await this.checkServerStatus();
        } catch (error) {
            logger.error('❌ Ошибка в цикле мониторинга:', error.message);
        }

        setTimeout(() => this.monitorLoop(), this.checkInterval);
    }

    async checkServerStatus() {
        try {
            logger.info('🔍 Проверка статуса сервера...');
            this.lastCheckTime = new Date();
            
            const response = await fetch(this.serverUrl, {
                timeout: 10000 // 10 секунд таймаут
            });
            
            if (!response.ok) {
                logger.warn(`⚠️ Сервер недоступен (HTTP ${response.status})`);
                this.lastServerStatus = false;
                await this.restartServer();
                return;
            }
            
            const data = await response.json();
            
            if (data.status !== 'running') {
                logger.warn(`⚠️ Сервер не работает (статус: ${data.status})`);
                this.lastServerStatus = false;
                await this.restartServer();
                return;
            }
            
            this.lastServerStatus = true;
            logger.info('✅ Сервер работает корректно');
            
        } catch (error) {
            logger.warn(`⚠️ Ошибка подключения к серверу: ${error.message}`);
            this.lastServerStatus = false;
            await this.restartServer();
        }
    }

    async ensureServerRunning() {
        logger.info('🔍 Проверка сервера при запуске...');
        
        try {
            const response = await fetch(this.serverUrl, {
                timeout: 5000
            });
            
            if (!response.ok) {
                logger.info('🚀 Запуск сервера...');
                await this.startServer();
            } else {
                const data = await response.json();
                if (data.status !== 'running') {
                    logger.info('🚀 Перезапуск сервера (неправильный статус)...');
                    await this.startServer();
                } else {
                    logger.info('✅ Сервер уже работает');
                }
            }
        } catch (error) {
            logger.info('🚀 Запуск сервера (недоступен)...');
            await this.startServer();
        }
    }

    async startServer() {
        try {
            const childProcess = spawn('node', ['server.js'], {
                detached: true,
                stdio: 'ignore'
            });
            
            childProcess.unref();
            
            logger.info(`✅ Сервер запущен (PID: ${childProcess.pid})`);
            
            // Даем серверу время на запуск
            await new Promise(resolve => setTimeout(resolve, 5000));
            
        } catch (error) {
            logger.error('❌ Ошибка запуска сервера:', error.message);
        }
    }

    async restartServer() {
        const now = Date.now();
        
        // Проверяем лимит перезапусков
        if (this.restartCount >= this.maxRestarts) {
            const timeSinceFirstRestart = now - (this.lastRestartTime || 0);
            if (timeSinceFirstRestart < this.restartWindow) {
                logger.error(`🚨 Превышен лимит перезапусков (${this.maxRestarts} за час)`);
                logger.error('🛑 Watchdog приостановлен для сервера');
                return;
            } else {
                // Сбрасываем счетчик если прошел час
                this.restartCount = 0;
            }
        }

        logger.info('🔄 Перезапуск сервера...');
        
        // Сначала убиваем старый процесс
        await this.killServer();
        
        // Ждем немного
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Запускаем новый
        await this.startServer();
        
        this.restartCount++;
        this.lastRestartTime = now;
        
        logger.info('✅ Сервер успешно перезапущен');
    }

    async killServer() {
        return new Promise((resolve) => {
            if (process.platform === 'win32') {
                // 1) Пытаемся убить все процессы, где в командной строке есть server.js
                const findByCmd = `wmic process where "commandline like '%server.js%'" get processid`;
                exec(findByCmd, (_e1, out1) => {
                    const pids = (out1 || '')
                        .split('\n')
                        .map(s => s.trim())
                        .filter(s => /^\d+$/.test(s));
                    const killAll = (list, done) => {
                        if (list.length === 0) return done();
                        const pid = list.shift();
                        exec(`taskkill /F /PID ${pid}`, () => killAll(list, done));
                    };
                    killAll([...pids], () => {
                        // 2) На случай зомби-процесса, который держит порт 3000
                        exec(`netstat -ano | findstr :3000`, (_e2, out2) => {
                            const listenLine = (out2 || '').split('\n').find(l => /LISTENING\s+\d+/.test(l));
                            const m = listenLine ? listenLine.match(/LISTENING\s+(\d+)/) : null;
                            const pidOnPort = m ? m[1] : null;
                            if (pidOnPort) {
                                exec(`taskkill /F /PID ${pidOnPort}`, () => resolve());
                            } else {
                                resolve();
                            }
                        });
                    });
                });
            } else {
                // Linux/Mac
                exec(`pkill -f "node server.js"`, () => resolve());
            }
        });
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            restartCount: this.restartCount,
            lastRestartTime: this.lastRestartTime,
            lastCheckTime: this.lastCheckTime,
            lastServerStatus: this.lastServerStatus,
            checkInterval: this.checkInterval,
            serverUrl: this.serverUrl,
            statusPort: this.statusPort
        };
    }
}

// Запуск Watchdog
const watchdog = new ServerWatchdog();

// Обработка аргументов командной строки
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'start':
        watchdog.start();
        break;
    case 'status':
        console.log('📊 Статус Watchdog:');
        console.log(watchdog.getStatus());
        break;
    default:
        console.log(`
🐕 Server Watchdog для Winamax Scraper

Использование: node watchdog.js [команда]

Команды:
  start    - Запустить Watchdog мониторинг
  status   - Показать статус

Примеры:
  node watchdog.js start
  node watchdog.js status

Функции Watchdog:
  ✅ Мониторинг сервера через API endpoint
  🔍 Проверка каждые 3 минуты
  🔄 Автоматический перезапуск при недоступности
  🛡️ Защита от зацикливания (макс 5 перезапусков/час)
  📊 Логирование всех операций
  🌐 Status API на порту 3001
        `);
        process.exit(0);
} 