import {
  joinVoiceChannel,
  entersState,
  EndBehaviorType,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import prism from 'prism-media';
import { config } from './config.js';
import { DISCORD_CHANNELS, DISCORD_RATE, downmixAndResample, pcmDurationMs, rms, toWav } from './audio.js';
import { transcribe, isLikelyHallucination } from './transcribe.js';
import { SpeakerBatcher } from './batcher.js';

const MIN_RMS = 0.005;

/** One active transcription session per guild. */
export const sessions = new Map();

export class TranscriptionSession {
  constructor(voiceChannel, textChannel) {
    this.guild = voiceChannel.guild;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;
    // Clips are transcribed in parallel but posted in the order people finished speaking.
    this.postQueue = Promise.resolve();
    this.names = new Map();
    this.stopped = false;
    this.batcher = new SpeakerBatcher({
      targetMs: config.batchTargetMs,
      maxWaitMs: config.batchMaxWaitMs,
      onFlush: (userId, mono, startedAt) => this.post(userId, mono, startedAt),
    });
  }

  async start() {
    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: false, // must be undeafened to receive audio
      selfMute: true,
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moved channels or a brief network blip — give it a moment to reconnect.
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        this.stop();
      }
    });
    this.connection.on(VoiceConnectionStatus.Destroyed, () => sessions.delete(this.guild.id));

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      this.stop();
      throw err;
    }

    this.connection.receiver.speaking.on('start', (userId) => this.listen(userId));
    sessions.set(this.guild.id, this);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    sessions.delete(this.guild.id);
    // Let in-flight audio streams finish, then transcribe whatever is still buffered.
    setTimeout(() => this.batcher.flushAll(), 500);
  }

  async displayName(userId) {
    if (this.names.has(userId)) return this.names.get(userId);
    const member = await this.guild.members.fetch(userId).catch(() => null);
    const info = { name: member?.displayName ?? `User ${userId}`, bot: member?.user.bot ?? false };
    this.names.set(userId, info);
    return info;
  }

  listen(userId) {
    const receiver = this.connection.receiver;
    if (receiver.subscriptions.has(userId)) return; // already recording this person

    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: config.silenceMs },
    });
    const decoder = new prism.opus.Decoder({ rate: DISCORD_RATE, channels: DISCORD_CHANNELS, frameSize: 960 });

    let chunks = [];
    let bytes = 0;
    const maxBytes = (config.maxClipMs / 1000) * DISCORD_RATE * DISCORD_CHANNELS * 2;
    const flush = () => {
      if (bytes === 0) return;
      const pcm = Buffer.concat(chunks, bytes);
      chunks = [];
      bytes = 0;
      this.handleClip(userId, pcm);
    };

    decoder.on('data', (chunk) => {
      chunks.push(chunk);
      bytes += chunk.length;
      if (bytes >= maxBytes) flush();
    });
    decoder.on('end', flush);
    decoder.on('error', (err) => console.warn(`Opus decode error for ${userId}:`, err.message));
    opusStream.on('error', (err) => console.warn(`Audio stream error for ${userId}:`, err.message));
    opusStream.pipe(decoder);
  }

  handleClip(userId, pcm) {
    const durationMs = pcmDurationMs(pcm);
    if (durationMs < config.minClipMs) return;
    const mono = downmixAndResample(pcm);
    if (rms(mono) < MIN_RMS) return;
    const startedAt = new Date(Date.now() - durationMs - config.silenceMs);
    this.batcher.add(userId, mono, durationMs, startedAt);
    if (this.stopped) this.batcher.flush(userId);
  }

  post(userId, mono, startedAt) {
    const job = Promise.all([this.displayName(userId), transcribe(toWav(mono))]).catch((err) => {
      console.error(err);
      return null;
    });

    this.postQueue = this.postQueue
      .then(() => job)
      .then(async (result) => {
        if (!result) return;
        const [{ name, bot }, text] = result;
        if (bot || isLikelyHallucination(text)) return;
        const time = `<t:${Math.floor(startedAt.getTime() / 1000)}:T>`;
        const line = `${time} **${escapeMarkdown(name)}**: ${text}`;
        await this.textChannel.send({ content: line.slice(0, 2000), allowedMentions: { parse: [] } });
      })
      .catch((err) => console.error('Failed to post transcript:', err));
  }
}

function escapeMarkdown(text) {
  return text.replace(/([*_`~|\\>])/g, '\\$1');
}
