export function formatTelegramMessage({ project, projectKey, values, origin, ip, now = new Date() }) {
  const rows = Object.entries(project.fields)
    .filter(([name]) => values[name])
    .map(([name, field]) => `<b>${escapeHtml(field.label)}:</b> ${escapeHtml(values[name])}`);

  return [
    `📩 <b>Новая заявка — ${escapeHtml(project.title)}</b>`,
    '',
    ...rows,
    '',
    `<b>Источник:</b> ${escapeHtml(projectKey)}`,
    origin ? `<b>Сайт:</b> ${escapeHtml(origin)}` : null,
    `<b>Время:</b> ${escapeHtml(now.toLocaleString('ru-RU', { timeZone: 'Europe/Warsaw' }))}`,
    ip ? `<b>IP:</b> ${escapeHtml(ip)}` : null,
  ].filter(Boolean).join('\n');
}

export async function sendTelegram(config, text, fetchImpl = fetch) {
  if (!config.telegramToken || !config.telegramChatId) {
    const error = new Error('Telegram is not configured');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegramChatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`Telegram API rejected the message (${response.status}): ${details}`);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]);
}
