import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_LIST } from '../games/index';
import type { GameModule } from '../games/registry';
import type { Action, LiveState } from '../lib/types';

const REQUIRED = ['movietrivia', 'quickdraw', 'trivia', 'tugofwar', 'fogduel', 'sculptionary', 'werewolf', 'truthordare', 'tag'];
const EXPECTED_BOUNDS: Record<string, [number, number]> = {
  sculptionary: [3, 8],
  werewolf: [4, 8],
  trivia: [2, 8],
  tag: [2, 8],
  quickdraw: [2, 2],
  tugofwar: [2, 2],
  fogduel: [2, 2],
  truthordare: [3, 8],
  movietrivia: [2, 8],
};

const apply = (mod: GameModule, state: LiveState, action: Action): LiveState => mod.applyAction(state, action);
const uid = (n: number) => `u${n}`;

test('registry advertises exactly the 9 required games with sane bounds', () => {
  assert.deepEqual(GAME_LIST.map((g) => g.id).sort(), [...REQUIRED].sort());
  for (const id of REQUIRED) {
    const g = GAMES[id];
    assert.ok(g, `missing module ${id}`);
    assert.equal(g.id, id);
    assert.ok(g.displayName && g.tagline, `${id} needs display metadata`);
    assert.ok(g.accent, `${id} needs an accent color`);
    assert.equal(typeof g.LobbyPreviewScene, 'function', `${id} LobbyPreviewScene`);
    assert.equal(typeof g.GameScene, 'function', `${id} GameScene`);
    assert.equal(typeof g.applyAction, 'function', `${id} applyAction`);
    assert.equal(typeof g.initState, 'function', `${id} initState`);
    assert.deepEqual([g.minPlayers, g.maxPlayers], EXPECTED_BOUNDS[id], `${id} player bounds`);
    assert.ok(g.minPlayers >= 2, `${id} must not support solo play`);
    assert.ok(g.minPlayers <= g.maxPlayers, `${id} min <= max`);
    // unknown actions must be ignored, never throw
    assert.doesNotThrow(() => g.applyAction(g.initState([uid(1), uid(2)], uid(1)), { type: 'nope', uid: uid(1) }));
  }
});

test('trivia: ask → buzz → answer → reveal → next, wrong answer locks the buzzer out', () => {
  const g = GAMES.trivia!;
  let s = g.initState([uid(1), uid(2)], uid(1));
  assert.equal(s.phase, 'waiting');

  s = apply(g, s, { type: 'ask', uid: uid(1), payload: { qIndex: 0, qOrder: [0] } });
  assert.equal(s.phase, 'question');

  s = apply(g, s, { type: 'buzz', uid: uid(1) });
  assert.equal(s.phase, 'buzzed');
  assert.equal(s.buzzedUid, uid(1));

  // find the right choice by probing (applyAction is the authority on correctness)
  const correct = [0, 1, 2, 3].filter((choice) => apply(g, s, { type: 'answer', uid: uid(1), payload: { choice } }).phase === 'reveal');
  assert.equal(correct.length, 1, 'exactly one choice must be correct');
  const wrong = [0, 1, 2, 3].find((c) => c !== correct[0])!;

  let bad = apply(g, s, { type: 'answer', uid: uid(1), payload: { choice: wrong } });
  assert.equal(bad.phase, 'question');
  // the player who already buzzed cannot buzz again this question
  assert.equal(apply(g, bad, { type: 'buzz', uid: uid(1) }).phase, 'question');
  bad = apply(g, bad, { type: 'buzz', uid: uid(2) });
  assert.equal(bad.buzzedUid, uid(2));

  const ok = apply(g, bad, { type: 'answer', uid: uid(2), payload: { choice: correct[0] } });
  assert.equal(ok.phase, 'reveal');
  assert.equal(ok.correctUid, uid(2)); // scoring target

  let next = apply(g, ok, { type: 'next', uid: uid(1) });
  assert.equal(next.phase, 'question');
  assert.equal(next.qIndex, 1);
  next = apply(g, next, { type: 'end', uid: uid(1) });
  assert.equal(next.phase, 'done');
});

test('movietrivia: full buzz-and-score cycle with distinct question order', () => {
  const g = GAMES.movietrivia!;
  let s = apply(g, g.initState([uid(1), uid(2)], uid(1)), { type: 'ask', uid: uid(1), payload: { qIndex: 0, qOrder: [5, 1, 0] } });
  assert.equal(s.phase, 'question');
  s = apply(g, s, { type: 'buzz', uid: uid(2) });
  assert.equal(s.buzzedUid, uid(2));
  const correct = [0, 1, 2, 3].find((choice) => apply(g, s, { type: 'answer', uid: uid(2), payload: { choice } }).phase === 'reveal');
  assert.notEqual(correct, undefined);
  const reveal = apply(g, s, { type: 'answer', uid: uid(2), payload: { choice: correct } });
  assert.equal(reveal.phase, 'reveal');
  assert.equal(reveal.correctUid, uid(2));
});

test('quickdraw: countdown → arm → react → round win → best-of-5 done, early tap loses', () => {
  const g = GAMES.quickdraw!;
  let s = apply(g, g.initState([uid(1), uid(2)], uid(1)), { type: 'start', uid: uid(1), payload: { playerUids: [uid(1), uid(2)] } });
  assert.equal(s.phase, 'countdown');
  assert.equal(s.round, 1);

  // firing during the countdown = instant round loss
  const early = apply(g, s, { type: 'react', uid: uid(1) });
  assert.equal(early.phase, 'round-end');
  assert.equal(early.earlyLoser, uid(1));
  assert.equal(early.roundWinner, uid(2));

  // arm can only succeed once goAt has passed
  const armedTooSoon = apply(g, s, { type: 'arm', uid: uid(1) });
  assert.equal(armedTooSoon.phase, 'countdown');
  const armed = apply(g, { ...s, goAt: 0 }, { type: 'arm', uid: uid(1) });
  assert.equal(armed.phase, 'armed');

  // player 1 reacts first → wins the round and scores
  let r = apply(g, armed, { type: 'react', uid: uid(1) });
  r = apply(g, r, { type: 'react', uid: uid(2) });
  assert.equal(r.phase, 'round-end');
  assert.equal(r.roundWinner, uid(1));
  assert.equal(r.scores[uid(1)], 1);

  // race to 5
  let state: LiveState = r;
  for (let i = 0; i < 5 && state.phase !== 'done'; i++) {
    state = apply(g, state, { type: 'next-round', uid: uid(1) });
    if (state.phase === 'done') break;
    state = { ...state, goAt: 0 };
    state = apply(g, state, { type: 'arm', uid: uid(1) });
    state = apply(g, state, { type: 'react', uid: uid(1) });
    state = apply(g, state, { type: 'react', uid: uid(2) });
  }
  assert.equal(state.phase, 'done');
  assert.equal(state.winner, uid(1));
  assert.equal(state.scores[uid(1)] >= 5, true);
});

test('tugofwar: tap debounce, rope lead, and buzzer-decides path', () => {
  const g = GAMES.tugofwar!;
  const start = apply(g, g.initState([uid(1), uid(2)], uid(1)), { type: 'start', uid: uid(1), payload: { playerUids: [uid(1), uid(2)] } });
  assert.equal(start.phase, 'playing');

  // duplicate tap timestamps are debounced
  let s = apply(g, start, { type: 'tap', uid: uid(1), payload: { ts: 1000 } });
  const afterFirst = s.tapCounts[uid(1)];
  s = apply(g, s, { type: 'tap', uid: uid(1), payload: { ts: 1000 } });
  assert.equal(s.tapCounts[uid(1)], afterFirst);

  // build a full 30-tap lead → instant win
  let t = 1000;
  s = start;
  for (let i = 0; i < 30; i++) {
    t += 50;
    s = apply(g, s, { type: 'tap', uid: uid(1), payload: { ts: t } });
  }
  assert.equal(s.phase, 'done');
  assert.equal(s.winner, uid(1));

  // buzzer path: equal taps = draw
  let d = apply(g, start, { type: 'tap', uid: uid(1), payload: { ts: 10 } });
  d = apply(g, d, { type: 'tap', uid: uid(2), payload: { ts: 10 } });
  d = apply(g, d, { type: 'timeout', uid: uid(1) });
  assert.equal(d.phase, 'done');
  assert.equal(d.winner, null);
});

test('fogduel: place fleets → turn-locked fire → hit → sink → win', () => {
  const g = GAMES.fogduel!;
  interface Cell { shipId: string | null; hit: boolean; revealed: boolean }
  const empty = (): Cell[][] => Array.from({ length: 5 }, () => Array.from({ length: 5 }, (): Cell => ({ shipId: null, hit: false, revealed: false })));
  const withShip = (cells: Array<[number, number]>, id: string) => {
    const grid = empty();
    for (const [r, c] of cells) grid[r][c] = { shipId: id, hit: false, revealed: false };
    return grid;
  };

  let s = g.initState([uid(1), uid(2)], uid(1));
  assert.equal(s.phase, 'placing');

  const gridA = withShip([[0, 0]], 'a1');
  const gridB = withShip([[0, 0]], 'b1');
  s = apply(g, s, { type: 'place', uid: uid(1), payload: { grid: gridA, ships: [{ id: 'a1', cells: ['0,0'], sunk: false }] } });
  assert.equal(s.phase, 'placing', 'not playing until both fleets are placed');
  s = apply(g, s, { type: 'place', uid: uid(2), payload: { grid: gridB, ships: [{ id: 'b1', cells: ['0,0'], sunk: false }] } });
  assert.equal(s.phase, 'playing');
  assert.equal(s.turn, uid(1));

  // out-of-turn fire is ignored
  const ignored = apply(g, s, { type: 'fire', uid: uid(2), payload: { target: '0,0' } });
  assert.equal(ignored.turn, uid(1));

  // a hit on the opponent's last ship ends the game
  const win = apply(g, s, { type: 'fire', uid: uid(1), payload: { target: '0,0' } });
  assert.equal(win.winner, uid(1));
  assert.equal(win.phase, 'done');
  assert.equal(win.ships[uid(2)][0].sunk, true);

  // a miss passes the turn
  const miss = apply(g, s, { type: 'fire', uid: uid(1), payload: { target: '4,4' } });
  assert.equal(miss.turn, uid(2));
});

test('sculptionary: sculpt, guess, score, block cap, end', () => {
  const g = GAMES.sculptionary!;
  let s = g.initState([uid(1), uid(2), uid(3)], uid(1));
  assert.equal(s.phase, 'waiting');
  s = apply(g, s, { type: 'start', uid: uid(1), payload: { playerUids: [uid(1), uid(2), uid(3)], sculptorUid: uid(1), word: 'rocket' } });
  assert.equal(s.phase, 'playing');
  assert.equal(s.word, 'rocket');

  for (let i = 0; i < 30; i++) s = apply(g, s, { type: 'add-block', uid: uid(1), payload: { block: { id: `b${i}`, shape: 'box', pos: [0, 0, 0], scale: 1, color: '#fff' } } });
  assert.equal(s.blocks.length, 24, 'block limit enforced');

  s = apply(g, s, { type: 'guess', uid: uid(2), payload: { text: 'castle', name: 'Two' } });
  assert.equal(s.guesses.at(-1).correct, false);
  assert.equal(s.winnerUids.length, 0);

  s = apply(g, s, { type: 'guess', uid: uid(2), payload: { text: 'ROCKET', name: 'Two' } });
  assert.equal(s.guesses.at(-1).correct, true);
  assert.deepEqual(s.winnerUids, [uid(2)]);

  // duplicate correct guesses from the same player do not double-score
  const before = s.winnerUids.length;
  s = apply(g, s, { type: 'guess', uid: uid(2), payload: { text: 'rocket', name: 'Two' } });
  assert.equal(s.winnerUids.length, before);

  s = apply(g, s, { type: 'end', uid: uid(1) });
  assert.equal(s.phase, 'done');
});

test('werewolf: deal → night kill → reveal → day vote → villagers win', () => {
  const g = GAMES.werewolf!;
  const roles = { u1: 'werewolf', u2: 'seer', u3: 'villager', u4: 'villager' } as Record<string, 'werewolf' | 'seer' | 'villager'>;
  let s = apply(g, g.initState(Object.keys(roles), uid(1)), { type: 'start', uid: uid(1), payload: { playerUids: Object.keys(roles), roles } });
  assert.equal(s.phase, 'night');
  assert.equal(s.dayNum, 1);
  assert.deepEqual(s.alive.sort(), ['u1', 'u2', 'u3', 'u4']);

  // wolves cannot kill their own pack
  assert.equal(apply(g, s, { type: 'wolf-kill', uid: uid(1), payload: { target: uid(1) } }).nightKill, null);

  s = apply(g, s, { type: 'wolf-kill', uid: uid(1), payload: { target: uid(2) } });
  assert.equal(s.nightKill, uid(2));
  s = apply(g, s, { type: 'seer-check', uid: uid(2), payload: { target: uid(1) } });
  assert.deepEqual(s.seerChecks[uid(2)], { target: uid(1), role: 'werewolf' });

  s = apply(g, s, { type: 'resolve-night', uid: uid(1) });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.eliminated, uid(2));
  assert.deepEqual(s.alive.sort(), ['u1', 'u3', 'u4']);

  s = apply(g, s, { type: 'to-day', uid: uid(1) });
  assert.equal(s.phase, 'day');
  s = apply(g, s, { type: 'vote', uid: uid(1), payload: { target: uid(3) } });
  s = apply(g, s, { type: 'vote', uid: uid(3), payload: { target: uid(1) } });
  s = apply(g, s, { type: 'vote', uid: uid(4), payload: { target: uid(1) } });
  s = apply(g, s, { type: 'resolve-day', uid: uid(1) });
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 'villagers');
  assert.equal(s.eliminated, uid(1));

  // a tied vote eliminates nobody and falls back to night
  let tie: LiveState = { ...s, phase: 'day', alive: ['u1', 'u3', 'u4'], votes: {}, winner: null, eliminated: null, noConsensus: false, revealSource: null };
  tie = apply(g, tie, { type: 'vote', uid: uid(3), payload: { target: uid(1) } });
  tie = apply(g, tie, { type: 'vote', uid: uid(1), payload: { target: uid(3) } });
  tie = apply(g, tie, { type: 'resolve-day', uid: uid(1) });
  assert.equal(tie.phase, 'night');
  assert.equal(tie.eliminated, null);
  assert.equal(tie.noConsensus, true);
});

test('truthordare: pick → choose → vote → score → next, prompts never repeat', () => {
  const g = GAMES.truthordare!;
  let s = g.initState([uid(1), uid(2), uid(3)], uid(1));
  assert.equal(s.phase, 'waiting');
  s = apply(g, s, { type: 'start', uid: uid(1) });
  assert.equal(s.phase, 'picking');
  assert.ok(s.truthOrder.length > 50 && s.dareOrder.length > 50, 'shuffled 100+ prompt decks');

  s = apply(g, s, { type: 'pick-player', uid: uid(1), payload: { uid: uid(2) } });
  assert.equal(s.phase, 'chosen');
  assert.equal(s.currentPlayerUid, uid(2));

  s = apply(g, s, { type: 'choose', uid: uid(2), payload: { choice: 'truth' } });
  assert.equal(s.phase, 'revealed');
  const firstPrompt = s.promptIndex;
  assert.equal(s.usedTruths.length, 1);

  s = apply(g, s, { type: 'vote', uid: uid(1), payload: { verdict: 'done' } });
  s = apply(g, s, { type: 'vote', uid: uid(3), payload: { verdict: 'done' } });
  const score = apply(g, s, { type: 'resolve', uid: uid(1) });
  assert.equal(score.phase, 'scored');
  assert.equal(score.roundScores[uid(2)], 50, 'truth completed = +50');
  assert.equal(score.round, 1);

  // chicken-out path scores 0, dare completed = +100
  const dare = apply(g, s, { type: 'choose', uid: uid(2), payload: { choice: 'dare' } });
  assert.equal(dare.usedDares.length, 1);
  assert.equal(dare.usedTruths.length, 1, 'truth deck untouched by a dare');
  const chickened = apply(g, { ...dare, votes: { u1: 'chickened', u3: 'chickened' } }, { type: 'resolve', uid: uid(1) });
  assert.equal(chickened.roundScores[uid(2)], 0);

  const next = apply(g, score, { type: 'next', uid: uid(1) });
  assert.equal(next.phase, 'picking');
  assert.equal(next.currentPlayerUid, null);
});

test('tag: start → move → symmetric tag transfer → arena clamp → end', () => {
  const g = GAMES.tag!;
  let s = apply(g, g.initState([uid(1), uid(2)], uid(1)), { type: 'start', uid: uid(1), payload: { playerUids: [uid(1), uid(2)], itUid: uid(1) } });
  assert.equal(s.phase, 'playing');
  assert.equal(s.itUid, uid(1));

  // runner moves onto "it" → tag transfers symmetrically
  s = apply(g, s, { type: 'move', uid: uid(2), payload: { pos: { x: s.positions[uid(1)].x, z: s.positions[uid(1)].z } } });
  assert.equal(s.itUid, uid(2));

  // movement is clamped inside the circular arena
  s = apply(g, s, { type: 'move', uid: uid(1), payload: { pos: { x: 100, z: 0 } } });
  assert.ok(Math.hypot(s.positions[uid(1)].x, s.positions[uid(1)].z) <= 7.0001);

  s = apply(g, s, { type: 'end', uid: uid(1), payload: { winnerUid: uid(1) } });
  assert.equal(s.phase, 'done');
});
