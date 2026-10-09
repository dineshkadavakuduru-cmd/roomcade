/**
 * Live multiplayer integration test against the REAL configured backend
 * (Firebase Realtime Database — the same one production uses).
 *
 * It drives the actual `lib/room-store` API with several simulated clients
 * (distinct session identities), asserting join/leave/reconnect/full-room/
 * invalid-code behaviour, live-state round-trips, cross-game scoring and
 * empty-room cleanup. The browser-level two-tab test lives in
 * scripts/verify-production.ts.
 *
 * Run: npm run test:multiplayer
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- env: load .env.local before the store reads NEXT_PUBLIC_* -------------
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

/** Minimal sessionStorage shim, swappable per simulated client. */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  const ok = !!cond;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
async function expectReject(name: string, p: Promise<unknown>, code: string) {
  try {
    await p;
    check(name, false, `expected rejection ${code}, resolved instead`);
  } catch (e: any) {
    check(name, String(e?.message ?? e) === code, `got "${e?.message ?? e}"`);
  }
}
async function waitFor<T>(fn: () => T | undefined, label: string, timeoutMs = 12000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function main() {
  const store = await import('../lib/room-store');
  const { resolveAvatar } = await import('../lib/avatars');
  const { getFirebase } = await import('../lib/firebase');
  const { get, ref, remove } = await import('firebase/database');

  console.log('RTDB configured:', Boolean(process.env.NEXT_PUBLIC_FIREBASE_RTDB_URL));
  if (!process.env.NEXT_PUBLIC_FIREBASE_RTDB_URL) {
    console.error('No NEXT_PUBLIC_FIREBASE_RTDB_URL — cannot run the live multiplayer test.');
    return 2;
  }

  const clients = new Map<string, MemStorage>();
  const asClient = (name: string) => {
    let s = clients.get(name);
    if (!s) { s = new MemStorage(); clients.set(name, s); }
    (globalThis as any).sessionStorage = s;
    return s;
  };

  const fb = getFirebase()!;
  const rawRoom = async (code: string) => (await get(ref(fb.rtdb, `rooms/${code}`))).val();
  const rawMeta = async (code: string) => (await get(ref(fb.rtdb, `rooms/${code}/meta`))).val();
  const playersOf = (meta: any): any[] => {
    if (!meta) return [];
    const p = meta.players;
    return Array.isArray(p) ? p : p && typeof p === 'object' ? Object.values(p) : [];
  };

  let roomCode = '';
  try {
    // ---- 1. Client A creates a room --------------------------------------
    asClient('A');
    const { code, uid: uidA } = await store.createRoom('Alice', '#FF6B35', 'movietrivia');
    roomCode = code;
    check('1. create room returns a 5-char code + uid', code.length === 5 && !!uidA, code);
    let meta = await rawMeta(code);
    check('1. room exists with exactly the host', playersOf(meta).length === 1);
    check('1. host carries stable avatarId + canonical color',
      playersOf(meta)[0].avatarId === 'cyber-fox' && playersOf(meta)[0].avatarColor === '#FF6B35');

    // ---- 2. Client B joins by code ---------------------------------------
    asClient('B');
    const uidB = await store.joinRoom(code.toLowerCase(), 'Bob', '#FB4D6D');
    check('2. second tab gets a distinct uid', uidB !== uidA, `${uidA} vs ${uidB}`);
    meta = await rawMeta(code);
    const b = playersOf(meta).find((p: any) => p.uid === uidB);
    check('2. joiner recorded with correct avatar', b?.avatarId === 'blaze-wolf' && b?.name === 'Bob');

    // ---- 3/4/5. Both clients observe live membership updates -------------
    asClient('A');
    let seenA: any[] = [];
    const unsubA = store.subscribeRoom(code, (m) => { seenA = m?.players ?? []; });
    asClient('B');
    let seenB: any[] = [];
    const unsubB = store.subscribeRoom(code, (m) => { seenB = m?.players ?? []; });

    await waitFor(() => (seenA.length === 2 ? seenA : undefined), 'A sees 2 players');
    await waitFor(() => (seenB.length === 2 ? seenB : undefined), 'B sees 2 players');
    check('3. both clients see the same identities', seenA.map((p) => p.name).sort().join(',') === 'Alice,Bob');
    const aSeesB = seenA.find((p) => p.uid === uidB);
    const bSeesA = seenB.find((p) => p.uid === uidA);
    check('4. cross-client avatars are correct on both sides',
      resolveAvatar(aSeesB?.avatarId).name === 'Blaze Wolf' && resolveAvatar(bSeesA?.avatarId).name === 'Cyber Fox');

    asClient('C');
    await store.joinRoom(code, 'Cy', '#34D399');
    await waitFor(() => (seenA.length === 3 ? seenA : undefined), 'A sees join');
    await waitFor(() => (seenB.length === 3 ? seenB : undefined), 'B sees join');
    check('5. player JOIN propagates to both clients', seenA.length === 3 && seenB.length === 3);

    // ---- 6. Player leaving updates both clients --------------------------
    asClient('C');
    await store.leaveRoom(code);
    await waitFor(() => (seenA.length === 2 ? seenA : undefined), 'A sees leave');
    await waitFor(() => (seenB.length === 2 ? seenB : undefined), 'B sees leave');
    check('6. player LEAVE propagates to both clients', seenA.length === 2 && seenB.length === 2);

    // ---- 7. Refresh / reconnect keeps the same identity ------------------
    asClient('A');
    const uidA2 = await store.joinRoom(code, 'Alice', '#FF6B35');
    check('7. rejoin returns the same uid (no duplicate player)', uidA2 === uidA, uidA2);
    const metaAfterRejoin = await rawMeta(code);
    check('7. reconnect keeps player count at 2', playersOf(metaAfterRejoin).length === 2);
    const aRow = playersOf(metaAfterRejoin).find((p: any) => p.uid === uidA);
    check('7. reconnect preserves the selected avatar', aRow?.avatarId === 'cyber-fox');

    // ---- 8. Invalid room codes produce a clear error ---------------------
    asClient('B');
    await expectReject('8. invalid room code rejects with ROOM_NOT_FOUND', store.joinRoom('ZZZZZ', 'Bob', '#FF3D81'), 'ROOM_NOT_FOUND');

    // ---- 9. Full rooms are rejected --------------------------------------
    const fillers = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'];
    for (const f of fillers) {
      if (playersOf(await rawMeta(code)).length >= 8) break;
      asClient(f);
      await store.joinRoom(code, f, '#38BDF8');
    }
    const filled = playersOf(await rawMeta(code)).length;
    check('9. room fills to capacity 8', filled === 8, `players=${filled}`);
    asClient('Overflow');
    await expectReject('9. 9th player is rejected with ROOM_FULL', store.joinRoom(code, 'Overflow', '#8B5CF6'), 'ROOM_FULL');

    // ---- Live game state round-trip --------------------------------------
    asClient('A');
    let liveSeen: any = undefined;
    const unsubLive = store.subscribeLive(code, (s) => { liveSeen = s; });
    await store.setLive(code, { phase: 'question', qIndex: 2 });
    await waitFor(() => (liveSeen?.qIndex === 2 ? liveSeen : undefined), 'live state broadcast');
    check('L1. live game state round-trips', liveSeen.phase === 'question' && liveSeen.qIndex === 2);
    await store.setLive(code, null);
    await waitFor(() => (liveSeen === null ? true : undefined), 'live state cleared');
    check('L2. returning to lobby clears live state', liveSeen === null);

    // ---- Cross-game score persistence (accumulates, never resets) --------
    await store.awardScores(code, { [uidA]: 100 });
    await store.awardScores(code, { [uidA]: 50 });
    const scored = playersOf(await rawMeta(code)).find((p: any) => p.uid === uidA);
    check('S1. scores accumulate across games', scored?.score === 150, `score=${scored?.score}`);
    await store.awardScores(code, { [uidB]: 200 });
    const metaS2 = await rawMeta(code);
    const scoredB = playersOf(metaS2).find((p: any) => p.uid === uidB);
    const stillHasA = playersOf(metaS2).find((p: any) => p.uid === uidA);
    check('S2. awarding another player does not wipe the room', playersOf(metaS2).length === filled, `players=${playersOf(metaS2).length}`);
    check('S3. other players scores are untouched', scoredB?.score === 200 && stillHasA?.score === 150, `B=${scoredB?.score} A=${stillHasA?.score}`);

    // Detach observers first: a room is only deleted once it is empty, at which
    // point no other client is subscribed to it.
    unsubA(); unsubB(); unsubLive();

    // ---- 10. Cleanup when everyone leaves --------------------------------
    for (const f of ['A', 'B', ...fillers]) {
      asClient(f);
      await store.leaveRoom(code);
    }
    const after = await rawRoom(code);
    check('10. room node is deleted after the last player leaves', after == null, `raw=${JSON.stringify(after)}`);
  } catch (e: any) {
    failed++;
    console.error('UNEXPECTED ERROR:', e?.stack ?? e);
  } finally {
    try {
      if (roomCode && (await rawRoom(roomCode))) await remove(ref(fb.rtdb, `rooms/${roomCode}`));
    } catch { /* ignore cleanup errors */ }
  }

  console.log(`\n${failed === 0 ? 'ALL MULTIPLAYER CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
