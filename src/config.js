import fs from 'node:fs';

export function loadEnvFile(path = '.env', env = process.env) {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith('#') || env[match[1]] !== undefined) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function loadConfig(env = process.env) {
  return {
    port: integer(env.PORT, 3000),
    telegramToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: env.TELEGRAM_CHAT_ID || '',
    projectOrigins: parseOrigins(env.PROJECT_ORIGINS),
    rateLimitMax: integer(env.RATE_LIMIT_MAX, 8),
    rateLimitWindowMs: integer(env.RATE_LIMIT_WINDOW_MS, 60_000),
    bodyLimit: integer(env.REQUEST_BODY_LIMIT_BYTES, 16_384),
    trustProxy: env.TRUST_PROXY === 'true',
  };
}

function integer(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOrigins(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return Object.fromEntries(Object.entries(value).map(([project, origins]) => [
      project,
      Array.isArray(origins) ? origins.map(normalizeOrigin).filter(Boolean) : [],
    ]));
  } catch {
    throw new Error('PROJECT_ORIGINS must be a valid JSON object');
  }
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}
