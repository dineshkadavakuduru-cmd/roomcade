import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rules = JSON.parse(readFileSync(resolve(process.cwd(), 'database.rules.json'), 'utf8'));

const walk = (node: any, visit: (path: string, node: any) => void, path = ''): void => {
  visit(path, node);
  for (const [key, value] of Object.entries(node ?? {})) {
    if (value && typeof value === 'object') walk(value, visit, path ? `${path}/${key}` : key);
  }
};

test('the rules tree has no blanket read/write grants', () => {
  walk(rules, (path, node) => {
    assert.notEqual(node['.read'], true, `blanket .read true at ${path || 'root'}`);
    assert.notEqual(node['.write'], true, `blanket .write true at ${path || 'root'}`);
  });
  assert.equal(rules.rules['.read'], false);
  assert.equal(rules.rules['.write'], false);
});

test('clients cannot enumerate every room', () => {
  const rooms = rules.rules.rooms;
  assert.equal(rooms['.read'], false, 'rooms list must not be readable');
  const code = rooms.$code;
  assert.match(code['.read'], /auth != null/, 'per-room read requires auth');
});

test('player writes are bound to auth.uid and validated', () => {
  const player = rules.rules.rooms.$code.meta.players.$uid;
  assert.match(player['.write'], /\$uid === auth\.uid/);
  assert.match(player['.write'], /hostId/);
  assert.match(player.uid['.validate'], /newData\.val\(\) === \$uid/);
  assert.match(player.name['.validate'], /length >= 1/);
  assert.match(player.name['.validate'], /length <= 24/);
  assert.match(player.avatarColor['.validate'], /matches/);
  assert.match(player.score['.validate'], /isNumber/);
  // monotonic scores: never below the pre-write value
  assert.match(player.score['.validate'], /root\.child\('rooms'\)/);
});

test('capacity is validated server-side at the players node', () => {
  const players = rules.rules.rooms.$code.meta.players;
  assert.match(players['.validate'], /numChildren\(\) <= 8/);
  assert.equal(players['.write'], false, 'players are written one uid at a time');
});

test('host-only room phase cannot be overwritten by guests', () => {
  const meta = rules.rules.rooms.$code.meta;
  for (const field of ['status', 'currentGameId', 'selectedGameId', 'round']) {
    assert.match(meta[field]['.write'], /hostId.*=== auth\.uid|auth\.uid.*hostId/, `${field} must be host-only`);
  }
  assert.match(meta.hostId['.write'], /players.*exists/, 'host migration requires membership');
  assert.match(meta.hostId['.write'], /!data\.parent\(\)\.child\('players'\)\.child\(data\.val\(\)\)\.exists\(\)/, 'migration only when the host is gone');
});

test('live state is member-only, bounded and only the host can clear it', () => {
  const live = rules.rules.rooms.$code.live;
  assert.match(live['.write'], /meta.*players.*auth\.uid/);
  assert.match(live['.write'], /newData\.exists\(\) \|\|/);
  assert.match(live['.validate'], /length <= 30000/);
});

test('presence nodes are per-uid and cleaned on disconnect by the client', () => {
  const presence = rules.rules.rooms.$code.presence.$uid;
  assert.match(presence['.write'], /\$uid === auth\.uid/);
  const store = readFileSync(resolve(process.cwd(), 'lib/room-store.ts'), 'utf8');
  assert.match(store, /onDisconnect\(ref\(rtdb, playerPath\)\)\.remove\(\)/);
  assert.match(store, /onDisconnect\(ref\(rtdb, presencePath\)\)\.remove\(\)/);
});
