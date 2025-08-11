import fetch from 'node-fetch';
import { logger } from './logger.js';
import { config } from '../config/config.js';

export async function sendTelegramMessage(text) {
  const token = config.telegram.botToken;
  const chatId = config.telegram.chatId;
  if (!token || !chatId) {
    logger.warn('⚠️ TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return false;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      timeout: 10000
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      logger.warn(`⚠️ Ошибка Telegram API: HTTP ${resp.status} ${body}`);
      return false;
    }
    return true;
  } catch (e) {
    logger.error('❌ Ошибка отправки сообщения в Telegram:', e.message);
    return false;
  }
}


