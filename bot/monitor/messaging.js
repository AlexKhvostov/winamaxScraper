import { logger } from '../../src/utils/logger.js';

export async function sendMessage(bot, chatId, message) {
  try {
    await bot.telegram.sendMessage(chatId, message);
  } catch (error) {
    logger.error('❌ Ошибка отправки сообщения в Telegram:', error?.message || error);
  }
}


