import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_LIST } from '../games/index';

const uids = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);

for (const game of GAME_LIST) {
  test(`${game.id}: initState is defined and JSON-safe for 2, 4 and 8 players`, () => {
    for (const n of [2, 4, 8]) {
      const players = uids(n);
      const state = game.initState(players, players[0]!);
      assert.ok(state && typeof state === 'object', `${game.id} initState(${n}) must return an object`);
      assert.equal(typeof state.phase, 'string', `${game.id} initState(${n}) must set a phase`);
      // Live state is stored as a JSON string in RTDB — it must round-trip.
      const round = JSON.parse(JSON.stringify(state));
      assert.equal(round.phase, state.phase);
      // Unknown actions must never throw or collapse the state to undefined.
      const after = game.applyAction(state, { type: '__unknown__', uid: players[0]! });
      assert.equal(after.phase, state.phase);
    }
  });
}

test('the registry covers all 9 games with two-player minimums', () => {
  assert.equal(GAME_LIST.length, 9);
  for (const game of GAME_LIST) {
    assert.ok(GAMES[game.id] === game);
    assert.ok(game.minPlayers >= 2);
    assert.ok(game.maxPlayers <= 8);
    assert.ok(game.minPlayers <= game.maxPlayers);
  }
});
