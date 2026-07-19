import test from 'node:test';
import assert from 'node:assert/strict';
import { projects, validateSubmission } from '../src/projects.js';
import { formatTelegramMessage } from '../src/telegram.js';

test('validates each current project contract', () => {
  const payloads = {
    'a-house': { name: 'Anna', contact: '+48 123 456 789', project: 'family', message: 'Dom 120 m²' },
    'clean-space': { name: 'Anna', contact: 'a@b.pl', service: 'Office', message: '' },
    'led-flex': { name: 'Firma', email: 'hello@example.com', message: 'Ekran 4x2 m' },
    'laser-clean': { name: 'Jan', phone: '+48 123 456 789', email: 'jan@example.com', message: 'Rdza' },
    voltares: { name: 'Anna', contact: '+48 123 456 789', service: 'Consultation', message: 'Proszę o kontakt' },
  };

  for (const [key, payload] of Object.entries(payloads)) {
    assert.ok(validateSubmission(projects[key], payload).values, key);
  }
});

test('rejects invalid required fields and email', () => {
  const result = validateSubmission(projects['laser-clean'], { name: 'J', phone: '1', email: 'nope', message: '' });
  assert.deepEqual(result.errors, { name: 'too_short', phone: 'too_short', email: 'invalid_email', message: 'required' });
});

test('silently accepts honeypot spam', () => {
  assert.deepEqual(validateSubmission(projects['clean-space'], {
    name: 'Bot', contact: 'bot@example.com', service: 'Office', company: 'Spam Ltd',
  }), { spam: true });
});

test('escapes Telegram HTML and includes server-side source', () => {
  const message = formatTelegramMessage({
    project: projects['a-house'], projectKey: 'a-house',
    values: { name: '<Admin>', contact: 'a&b', message: '' },
    origin: 'https://a-house.example', ip: '', now: new Date('2026-06-20T10:00:00Z'),
  });
  assert.match(message, /&lt;Admin&gt;/);
  assert.match(message, /a&amp;b/);
  assert.match(message, /Источник:<\/b> a-house/);
});
