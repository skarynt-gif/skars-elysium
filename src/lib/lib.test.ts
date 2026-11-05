import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmitter } from './emitter.ts';
import { hashString, seededRandom } from './random.ts';

test('emitter delivers to every listener and supports unsubscribe', () => {
  const e = createEmitter<number>();
  const got: number[] = [];
  const off = e.on((n) => got.push(n));
  e.on((n) => got.push(n * 10));
  e.emit(1);
  off();
  e.emit(2);
  assert.deepEqual(got, [1, 10, 20]);
});

test('a listener removing itself mid-emit does not skip others', () => {
  const e = createEmitter<void>();
  const calls: string[] = [];
  const offA = e.on(() => {
    calls.push('a');
    offA();
  });
  e.on(() => calls.push('b'));
  e.emit();
  assert.deepEqual(calls, ['a', 'b']);
});

test('seeded random is deterministic, in range, and seed-sensitive', () => {
  const a = seededRandom('garden');
  const b = seededRandom('garden');
  const c = seededRandom('other');
  const seqA = Array.from({ length: 50 }, a);
  assert.deepEqual(seqA, Array.from({ length: 50 }, b));
  assert.notDeepEqual(seqA, Array.from({ length: 50 }, c));
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('hash is stable', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
});
