import { projects, validateSubmission } from './projects.js';
import { formatTelegramMessage, sendTelegram } from './telegram.js';
import { buildInstructions, buildOpenApi, swaggerHtml } from './openapi.js';

export function createHandler(config, dependencies = {}) {
  const deliver = dependencies.sendTelegram || sendTelegram;
  const limiter = createRateLimiter(config.rateLimitMax, config.rateLimitWindowMs);

  return async function handler(req, res) {
    setSecurityHeaders(res);

    const url = new URL(req.url, 'http://localhost');
    const baseUrl = requestBaseUrl(req, config.trustProxy);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/api/instructions')) {
      return json(res, 200, buildInstructions(baseUrl));
    }
    if (req.method === 'GET' && url.pathname === '/openapi.json') {
      return json(res, 200, buildOpenApi(baseUrl));
    }
    if (req.method === 'GET' && (url.pathname === '/docs' || url.pathname === '/docs/')) {
      return html(res, 200, swaggerHtml());
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'contact-api',
        telegramConfigured: Boolean(config.telegramToken && config.telegramChatId),
      });
    }

    const match = url.pathname.match(/^\/api\/contact\/([a-z0-9-]+)$/);
    if (!match || !projects[match[1]]) return json(res, 404, { error: 'Not found' });

    const projectKey = match[1];
    const project = projects[projectKey];
    const origin = req.headers.origin || '';
    const originAllowed = isOriginAllowed(config, projectKey, origin, req);

    if (origin && originAllowed) setCorsHeaders(res, origin);
    if (req.method === 'OPTIONS') {
      return originAllowed ? empty(res, 204) : json(res, 403, { error: 'Origin not allowed' });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' }, { Allow: 'POST, OPTIONS' });
    if (!originAllowed) return json(res, 403, { error: 'Origin not allowed' });

    const ip = clientIp(req, config.trustProxy);
    const rate = limiter.take(`${projectKey}:${ip}`);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
      return json(res, 429, { error: 'Too many requests' });
    }

    try {
      const body = await readJson(req, config.bodyLimit);
      const validation = validateSubmission(project, body);
      if (validation.spam) return json(res, 200, { ok: true });
      if (validation.errors) return json(res, 400, { error: 'Invalid form data', fields: validation.errors });

      const text = formatTelegramMessage({ project, projectKey, values: validation.values, origin, ip });
      await deliver(config, text);
      return json(res, 200, { ok: true });
    } catch (error) {
      if (error.code === 'BODY_TOO_LARGE') return json(res, 413, { error: 'Request body too large' });
      if (error instanceof SyntaxError) return json(res, 400, { error: 'Invalid JSON' });
      console.error('Contact delivery failed:', error.message);
      return json(res, error.statusCode || 502, { error: 'Unable to deliver request' });
    }
  };
}

function isOriginAllowed(config, projectKey, origin, req) {
  if (!origin) return true;
  const allowed = config.projectOrigins[projectKey] || [];
  return origin === requestBaseUrl(req, config.trustProxy) || allowed.includes(origin) || (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
}

function requestBaseUrl(req, trustProxy) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = trustProxy && forwardedProto ? forwardedProto : (req.socket.encrypted ? 'https' : 'http');
  return `${protocol}://${req.headers.host || 'localhost'}`;
}

function clientIp(req, trustProxy) {
  if (trustProxy) return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  return req.socket.remoteAddress || 'unknown';
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      if (tooLarge) return;
      size += Buffer.byteLength(chunk);
      if (size > limit) {
        tooLarge = true;
        body = '';
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (tooLarge) {
        const error = new Error('Body too large');
        error.code = 'BODY_TOO_LARGE';
        reject(error);
        return;
      }
      try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function createRateLimiter(max, windowMs) {
  const buckets = new Map();
  return {
    take(key, now = Date.now()) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
      if (buckets.size > 10_000) for (const [id, value] of buckets) if (value.resetAt <= now) buckets.delete(id);
      return { allowed: bucket.count <= max, remaining: Math.max(0, max - bucket.count), retryAfterMs: bucket.resetAt - now };
    },
  };
}

function setSecurityHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function setCorsHeaders(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, status, value, headers = {}) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(value));
}

function html(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(value);
}

function empty(res, status) {
  res.writeHead(status);
  res.end();
}
