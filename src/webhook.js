import { createHmac } from 'node:crypto';
import { config } from './config.js';

/**
 * Sends transcript events to your website as JSON POSTs, in order.
 * Each request carries `X-Emaq-Signature: sha256=<hex HMAC of the raw body>` made with
 * WEBSITE_WEBHOOK_SECRET, so your site can check the request really came from Emaq.
 */
export class WebsiteWebhook {
  constructor() {
    this.url = config.website.url;
    this.secret = config.website.secret;
    this.queue = Promise.resolve();
  }

  get enabled() {
    return Boolean(this.url);
  }

  send(event) {
    if (!this.enabled) return Promise.resolve();
    const body = JSON.stringify({ ...event, sentAt: new Date().toISOString() });
    this.queue = this.queue.then(() => this.deliver(body, event.type));
    return this.queue;
  }

  async deliver(body, type) {
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'Emaq-Bot' };
    if (this.secret) {
      headers['X-Emaq-Signature'] = `sha256=${createHmac('sha256', this.secret).update(body).digest('hex')}`;
    }
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = await fetch(this.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15_000) });
        if (res.ok) return;
        await res.body?.cancel();
        if (res.status < 500 && res.status !== 429) {
          console.error(`Website rejected ${type} event (${res.status}); not retrying.`);
          return;
        }
        console.warn(`Website returned ${res.status} for ${type}; retrying (attempt ${attempt}/5)`);
      } catch (err) {
        console.warn(`Couldn't reach website for ${type}: ${err.message} (attempt ${attempt}/5)`);
      }
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
    console.error(`Gave up sending ${type} event to the website.`);
  }
}
