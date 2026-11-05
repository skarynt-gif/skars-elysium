import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStartGestureHub } from './startGesture.ts';
import { hasVisitedBefore, markVisited, readMemory, writeMemory, type KeyValueStore } from './visitMemory.ts';

test('start gesture runs every listener, in order, once per press', () => {
  const hub = createStartGestureHub();
  const calls: string[] = [];
  hub.onStart(() => calls.push('pointer-lock'));
  hub.onStart(() => calls.push('audio'));
  assert.equal(hub.hasRun, false);
  hub.run();
  assert.deepEqual(calls, ['pointer-lock', 'audio']);
  assert.equal(hub.hasRun, true);
});

test('a failing listener does not block the others', () => {
  const errors: unknown[] = [];
  const hub = createStartGestureHub((e) => errors.push(e));
  let audioUnlocked = false;
  hub.onStart(() => {
    throw new Error('pointer lock refused');
  });
  hub.onStart(() => {
    audioUnlocked = true;
  });
  hub.run();
  assert.equal(audioUnlocked, true);
  assert.equal(errors.length, 1);
});

test('listeners can unsubscribe', () => {
  const hub = createStartGestureHub();
  let count = 0;
  const off = hub.onStart(() => count++);
  off();
  hub.run();
  assert.equal(count, 0);
});

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

test('remembers a returning visitor', () => {
  const store = memoryStore();
  assert.equal(hasVisitedBefore(store), false);
  markVisited(store);
  assert.equal(hasVisitedBefore(store), true);
});

test('broken storage never crashes the game', () => {
  const broken: KeyValueStore = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceeded');
    },
  };
  assert.equal(readMemory('x', broken), null);
  assert.doesNotThrow(() => writeMemory('x', '1', broken));
  assert.equal(readMemory('x', null), null);
});
