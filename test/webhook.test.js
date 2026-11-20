import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';

test('posts signed events in order', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      received.push({ body, sig: req.headers['x-emaq-signature'] });
      res.end('ok');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.WEBSITE_WEBHOOK_URL = `http://127.0.0.1:${server.address().port}/hook`;
  process.env.WEBSITE_WEBHOOK_SECRET = 'shh';
  const { WebsiteWebhook } = await import('../src/webhook.js');

  const hook = new WebsiteWebhook();
  hook.send({ type: 'session.started', sessionId: 's1' });
  hook.send({ type: 'transcript.line', sessionId: 's1', text: 'I cast fireball' });
  await hook.send({ type: 'session.ended', sessionId: 's1' });
  server.close();

  assert.deepEqual(received.map((r) => JSON.parse(r.body).type), ['session.started', 'transcript.line', 'session.ended']);
  for (const r of received) {
    assert.equal(r.sig, `sha256=${createHmac('sha256', 'shh').update(r.body).digest('hex')}`);
  }
});
