// Discord hands us 48 kHz, 16-bit, stereo PCM once Opus is decoded.
export const DISCORD_RATE = 48000;
export const DISCORD_CHANNELS = 2;
const BYTES_PER_FRAME = DISCORD_CHANNELS * 2;

// Speech models only need 16 kHz mono, which makes uploads 6x smaller.
export const TARGET_RATE = 16000;
const DECIMATION = DISCORD_RATE / TARGET_RATE; // 3

export function pcmDurationMs(pcm) {
  return (pcm.length / BYTES_PER_FRAME / DISCORD_RATE) * 1000;
}

/** Convert 48 kHz stereo s16le PCM to 16 kHz mono s16le PCM (box-filter average, then decimate). */
export function downmixAndResample(pcm) {
  const inFrames = Math.floor(pcm.length / BYTES_PER_FRAME);
  const outFrames = Math.floor(inFrames / DECIMATION);
  const out = Buffer.alloc(outFrames * 2);
  for (let i = 0; i < outFrames; i++) {
    let sum = 0;
    for (let j = 0; j < DECIMATION; j++) {
      const offset = (i * DECIMATION + j) * BYTES_PER_FRAME;
      sum += pcm.readInt16LE(offset) + pcm.readInt16LE(offset + 2);
    }
    out.writeInt16LE(Math.round(sum / (DECIMATION * DISCORD_CHANNELS)), i * 2);
  }
  return out;
}

/** Root-mean-square loudness of mono s16le PCM, 0..1. Used to skip near-silent clips. */
export function rms(monoPcm) {
  const samples = monoPcm.length / 2;
  if (samples === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples; i++) {
    const s = monoPcm.readInt16LE(i * 2) / 32768;
    sumSquares += s * s;
  }
  return Math.sqrt(sumSquares / samples);
}

/** Wrap mono s16le PCM in a WAV header. */
export function toWav(monoPcm, sampleRate = TARGET_RATE) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + monoPcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(monoPcm.length, 40);
  return Buffer.concat([header, monoPcm]);
}
