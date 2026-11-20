import { config } from './config.js';

/**
 * Send a WAV clip to an OpenAI-compatible /audio/transcriptions endpoint
 * (OpenAI, Groq, a self-hosted faster-whisper server, etc.) and return the text.
 */
export async function transcribe(wav) {
  const { apiKey, baseUrl, model, language, prompt } = config.transcribe;

  let res;
  for (let attempt = 1; ; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'clip.wav');
    form.append('model', model);
    form.append('response_format', 'json');
    if (language) form.append('language', language);
    if (prompt) form.append('prompt', prompt);

    res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });

    // Rate limited or a temporary server error: wait and try again rather than losing the clip.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 5) break;
    const waitSec = Math.min(Number(res.headers.get('retry-after')) || 2 ** attempt, 60);
    console.warn(`Transcription API returned ${res.status}; retrying in ${waitSec}s (attempt ${attempt}/5)`);
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, waitSec * 1000));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Transcription failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.text || '').trim();
}

// Speech models sometimes "hear" these stock phrases in background noise.
const HALLUCINATIONS = new Set([
  'thank you.', 'thanks for watching!', 'thank you for watching.', 'thanks for watching.',
  'you', 'bye.', '.', 'please subscribe.', 'subtitles by the amara.org community',
]);

export function isLikelyHallucination(text) {
  return !text || HALLUCINATIONS.has(text.toLowerCase());
}
