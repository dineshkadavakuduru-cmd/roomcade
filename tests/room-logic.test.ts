import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GHOST_AGE_MS,
  MAX_NAME_LENGTH,
  ROOM_TTL_MS,
  cleanDisplayName,
  hostIsMissing,
  isGhost,
  roomIsStale,
  uniqueDisplayName,
} from '../lib/room-logic';

test('display names are trimmed, bounded and control characters removed', () => {
  assert.equal(cleanDisplayName('  Sam  '), 'Sam');
  assert.equal(cleanDisplayName(''), 'Player');
  assert.equal(cleanDisplayName(null, 'Guest'), 'Guest');
  assert.equal(cleanDisplayName('a\u0000b'), 'ab');
  assert.equal(cleanDisplayName('x'.repeat(50)).length, MAX_NAME_LENGTH);
});

test('duplicate display names get stable, unique suffixes', () => {
  assert.equal(uniqueDisplayName('Sam', []), 'Sam');
  assert.equal(uniqueDisplayName('Sam', ['sam']), 'Sam (2)');
  assert.equal(uniqueDisplayName('Sam', ['Sam', 'sam (2)']), 'Sam (3)');
  // staying inside the 24-char rule limit while adding a suffix
  const long = uniqueDisplayName('L'.repeat(MAX_NAME_LENGTH), ['l'.repeat(MAX_NAME_LENGTH)]);
  assert.ok(long.length <= MAX_NAME_LENGTH, `name too long: ${long.length}`);
  assert.match(long, / \(2\)$/);
});

test('a room is stale when empty or older than the TTL', () => {
  const now = 10_000_000;
  assert.equal(roomIsStale(0, now, now), true, 'empty rooms are stale');
  assert.equal(roomIsStale(2, 0, now), true, 'missing updatedAt is stale');
  assert.equal(roomIsStale(2, now - ROOM_TTL_MS - 1, now), true);
  assert.equal(roomIsStale(2, now - ROOM_TTL_MS + 1, now), false);
  assert.equal(roomIsStale(2, now, now), false);
});

test('host migration is required only when the recorded host left', () => {
  assert.equal(hostIsMissing('u1', [{ uid: 'u1' }, { uid: 'u2' }]), false);
  assert.equal(hostIsMissing('u1', [{ uid: 'u2' }]), true);
  assert.equal(hostIsMissing('', [{ uid: 'u2' }]), true);
  assert.equal(hostIsMissing('u1', []), false, 'empty room has nothing to migrate');
});

test('ghost pruning respects the heartbeat grace window', () => {
  const now = 10_000_000;
  assert.equal(isGhost(undefined, now), true);
  assert.equal(isGhost(0, now), true);
  assert.equal(isGhost(now - GHOST_AGE_MS - 1, now), true);
  assert.equal(isGhost(now - GHOST_AGE_MS + 1, now), false);
  assert.equal(isGhost(now, now), false);
});
