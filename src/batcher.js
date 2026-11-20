import { TARGET_RATE } from './audio.js';

const GAP = Buffer.alloc(Math.round(TARGET_RATE * 0.3) * 2); // 0.3s of silence between utterances

/**
 * Groups each speaker's utterances into larger clips before they're transcribed.
 *
 * Free speech-to-text tiers limit requests per minute/day (and Groq bills every
 * request as at least 10s), so one request per sentence burns through them fast.
 * A speaker's buffer is flushed once it holds `targetMs` of speech, or `maxWaitMs`
 * after its first utterance, whichever comes first.
 */
export class SpeakerBatcher {
  constructor({ targetMs, maxWaitMs, onFlush }) {
    this.targetMs = targetMs;
    this.maxWaitMs = maxWaitMs;
    this.onFlush = onFlush;
    this.buffers = new Map();
  }

  /** @param monoPcm 16 kHz mono s16le PCM  @param startedAt when the utterance began */
  add(userId, monoPcm, durationMs, startedAt) {
    if (this.targetMs <= 0) {
      this.onFlush(userId, monoPcm, startedAt);
      return;
    }
    let buf = this.buffers.get(userId);
    if (!buf) {
      buf = { parts: [], ms: 0, startedAt };
      buf.timer = setTimeout(() => this.flush(userId), this.maxWaitMs);
      this.buffers.set(userId, buf);
    } else {
      buf.parts.push(GAP);
    }
    buf.parts.push(monoPcm);
    buf.ms += durationMs;
    if (buf.ms >= this.targetMs) this.flush(userId);
  }

  flush(userId) {
    const buf = this.buffers.get(userId);
    if (!buf) return;
    clearTimeout(buf.timer);
    this.buffers.delete(userId);
    this.onFlush(userId, Buffer.concat(buf.parts), buf.startedAt);
  }

  flushAll() {
    // Oldest first, so the transcript stays roughly in order.
    const ids = [...this.buffers.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt).map(([id]) => id);
    for (const id of ids) this.flush(id);
  }
}
