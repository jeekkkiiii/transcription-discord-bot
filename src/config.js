import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  get token() { return required('DISCORD_TOKEN'); },
  get clientId() { return required('DISCORD_CLIENT_ID'); },
  guildId: process.env.DISCORD_GUILD_ID || null,

  transcribe: {
    get apiKey() { return process.env.TRANSCRIBE_API_KEY || required('OPENAI_API_KEY'); },
    baseUrl: (process.env.TRANSCRIBE_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
    language: process.env.TRANSCRIBE_LANGUAGE || null,
  },

  // How long someone must be quiet before their utterance is sent off to be transcribed.
  silenceMs: Number(process.env.SILENCE_MS || 1000),
  // Clips shorter than this are ignored (coughs, clicks, keyboard noise).
  minClipMs: Number(process.env.MIN_CLIP_MS || 700),
  // Long monologues are cut into chunks of at most this length.
  maxClipMs: Number(process.env.MAX_CLIP_MS || 30000),
};
