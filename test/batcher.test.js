import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SpeakerBatcher } from '../src/batcher.js';

const clip = (ms) => Buffer.alloc(Math.round((ms / 1000) * 16000) * 2, 1);

test('combines utterances until the target length is reached', () => {
  const flushed = [];
  const b = new SpeakerBatcher({ targetMs: 20000, maxWaitMs: 60000, onFlush: (id, pcm) => flushed.push([id, pcm.length]) });
  b.add('a', clip(8000), 8000, new Date(0));
  b.add('a', clip(8000), 8000, new Date(1));
  assert.equal(flushed.length, 0);
  b.add('a', clip(5000), 5000, new Date(2));
  assert.equal(flushed.length, 1);
  assert.equal(flushed[0][0], 'a');
  assert.equal(flushed[0][1], clip(21000).length + 2 * 4800 * 2); // plus two 0.3s gaps
  b.flushAll();
});

test('flushes after maxWait even if short', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const flushed = [];
  const b = new SpeakerBatcher({ targetMs: 20000, maxWaitMs: 60000, onFlush: (id) => flushed.push(id) });
  b.add('a', clip(1000), 1000, new Date(0));
  mock.timers.tick(59999);
  assert.equal(flushed.length, 0);
  mock.timers.tick(1);
  assert.deepEqual(flushed, ['a']);
  mock.timers.reset();
});

test('keeps speakers separate and flushAll goes oldest first', () => {
  const flushed = [];
  const b = new SpeakerBatcher({ targetMs: 20000, maxWaitMs: 60000, onFlush: (id) => flushed.push(id) });
  b.add('late', clip(1000), 1000, new Date(5000));
  b.add('early', clip(1000), 1000, new Date(1000));
  b.flushAll();
  assert.deepEqual(flushed, ['early', 'late']);
});

test('targetMs 0 disables batching', () => {
  const flushed = [];
  const b = new SpeakerBatcher({ targetMs: 0, maxWaitMs: 60000, onFlush: (id) => flushed.push(id) });
  b.add('a', clip(1000), 1000, new Date(0));
  assert.deepEqual(flushed, ['a']);
});
