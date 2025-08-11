export function getBotConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: (process.env.TELEGRAM_CHAT_ID || '').toString(),
    statusIntervalHours: parseInt(process.env.TELEGRAM_STATUS_INTERVAL_HOURS) || 8,
    monitoringIntervalMinutes: parseInt(process.env.TELEGRAM_MONITORING_INTERVAL_MINUTES) || 3,
    dailyReportHour: parseInt(process.env.TELEGRAM_DAILY_REPORT_HOUR) || 10
  };
}


