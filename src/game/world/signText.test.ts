import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapSignText } from './signText.ts';

test('short titles fit on one line, uppercased', () => {
  assert.deepEqual(wrapSignText('Velvet Hours', 24, 3), ['VELVET HOURS']);
});

test('wraps on word boundaries', () => {
  assert.deepEqual(wrapSignText('Golden Hour The Upcoming Extended Play', 16, 3), [
    'GOLDEN HOUR THE',
    'UPCOMING',
    'EXTENDED PLAY',
  ]);
});

test('breaks words longer than a line', () => {
  assert.deepEqual(wrapSignText('Supercalifragilistic', 8, 3), ['SUPERCAL', 'IFRAGILI', 'STIC']);
});

test('adds an ellipsis when there are too many lines', () => {
  const lines = wrapSignText('one two three four five six seven', 5, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1]!.endsWith('…'));
  for (const line of lines) assert.ok(line.length <= 5);
});

test('every line respects the width', () => {
  const lines = wrapSignText('A Very Long Collection Title With Many Words In It', 12, 4);
  for (const line of lines) assert.ok(line.length <= 12, line);
});

test('empty titles produce no lines', () => {
  assert.deepEqual(wrapSignText('   ', 10, 2), []);
});
