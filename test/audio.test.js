import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downmixAndResample, pcmDurationMs, rms, toWav } from '../src/audio.js';

function stereoTone(seconds, amplitude = 8000) {
  const frames = 48000 * seconds;
  const buf = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i++) {
    const s = Math.round(amplitude * Math.sin((2 * Math.PI * 440 * i) / 48000));
    buf.writeInt16LE(s, i * 4);
    buf.writeInt16LE(s, i * 4 + 2);
  }
  return buf;
}

test('duration of 48k stereo PCM', () => {
  assert.equal(pcmDurationMs(stereoTone(2)), 2000);
});

test('downmix to 16k mono is a third of the frames', () => {
  const mono = downmixAndResample(stereoTone(1));
  assert.equal(mono.length, 16000 * 2);
  assert.ok(rms(mono) > 0.1);
});

test('silence has zero rms', () => {
  assert.equal(rms(Buffer.alloc(3200)), 0);
});

test('wav header is valid', () => {
  const mono = downmixAndResample(stereoTone(1));
  const wav = toWav(mono);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(40), mono.length);
  assert.equal(wav.length, 44 + mono.length);
});
