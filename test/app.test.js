import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from '../src/app.js';

const config = {
  telegramToken: 'token', telegramChatId: 'chat', bodyLimit: 16_384,
  rateLimitMax: 8, rateLimitWindowMs: 60_000, trustProxy: false,
  projectOrigins: { 'a-house': ['https://a-house.example'] },
};

async function withServer(deliver, run) {
  const server = http.createServer(createHandler(config, { sendTelegram: deliver }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('delivers a valid form and identifies project from route', async () => {
  let sent = '';
  await withServer(async (_config, text) => { sent = text; }, async base => {
    const response = await fetch(`${base}/api/contact/a-house`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://a-house.example' },
      body: JSON.stringify({ name: 'Anna', contact: '+48123456789', message: 'Hello', source: 'fake-site' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
  assert.match(sent, /Новая заявка — A-House/);
  assert.match(sent, /Источник:<\/b> a-house/);
  assert.doesNotMatch(sent, /fake-site/);
});

test('blocks an origin not assigned to the project', async () => {
  await withServer(async () => {}, async base => {
    const response = await fetch(`${base}/api/contact/a-house`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}',
    });
    assert.equal(response.status, 403);
  });
});

test('returns field errors without contacting Telegram', async () => {
  let called = false;
  await withServer(async () => { called = true; }, async base => {
    const response = await fetch(`${base}/api/contact/a-house`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://a-house.example' },
      body: JSON.stringify({ name: '', contact: '' }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.fields.name, 'required');
  });
  assert.equal(called, false);
});

test('rejects an oversized body with 413', async () => {
  const smallConfig = { ...config, bodyLimit: 20 };
  const server = http.createServer(createHandler(smallConfig, { sendTelegram: async () => {} }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/contact/a-house`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://a-house.example' },
      body: JSON.stringify({ name: 'Anna', contact: '+48123456789' }),
    });
    assert.equal(response.status, 413);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('serves instructions, OpenAPI and Swagger UI', async () => {
  await withServer(async () => {}, async base => {
    const instructions = await fetch(`${base}/api/instructions`).then(response => response.json());
    assert.equal(instructions.method, 'POST');
    assert.equal(instructions.projects.length, 5);
    assert.match(instructions.projects[0].endpoint, /\/api\/contact\//);

    const openapi = await fetch(`${base}/openapi.json`).then(response => response.json());
    assert.equal(openapi.openapi, '3.1.0');
    assert.ok(openapi.paths['/api/contact/a-house'].post);
    assert.ok(openapi.paths['/api/contact/voltares'].post);
    assert.ok(openapi.components.schemas.AHouseSubmission.properties.project);
    assert.ok(openapi.components.schemas.VoltaresSubmission.properties.contact);

    const docsResponse = await fetch(`${base}/docs`);
    assert.match(docsResponse.headers.get('content-type'), /^text\/html/);
    assert.match(await docsResponse.text(), /SwaggerUIBundle/);
  });
});
