'use client';

/**
 * Room store: Realtime Database (RTDB) for room metadata + live state when Firebase
 * is configured; otherwise a local same-origin backend (localStorage +
 * BroadcastChannel) so two tabs on one machine can complete the full
 * create → join → play flow with zero setup.
 *
 * Identity: with Firebase configured every client is an anonymous Firebase user.
 * The app uid *is* the auth uid (per-tab persistence in lib/firebase), which lets
 * the RTDB rules in database.rules.json bind writes to `auth.uid` — a client can
 * only write its own player node, and cannot forge scores for anyone else.
 */
import { avatarFields, generateCode, normalizeCode, type Action, type LiveState, type Player, type RoomMeta } from './types';
import {
  GHOST_AGE_MS,
  MAX_PLAYERS,
  MAX_SCORE,
  cleanDisplayName as cleanName,
  hostIsMissing,
  isGhost,
  roomIsStale,
  uniqueDisplayName as uniqueName,
} from './room-logic';
import { authFailureReason, currentAuthUid, ensureAnonymousAuth, firebaseConfigured, getFirebase, retryAnonymousAuth } from './firebase';
import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from 'firebase/database';

const LS_ROOM = (code: string) => `roomcade:room:${code}`;
const LS_LIVE = (code: string) => `roomcade:live:${code}`;
const BC = (code: string) => `roomcade-bc-${code}`;
const SS_SCORE = (code: string, uid: string) => `roomcade:score:${code}:${uid}`;

/**
 * Last score we saw for ourselves in a room. A reload or a dropped network makes
 * RTDB's onDisconnect delete this player's node, so rejoining would otherwise
 * reset the night's score to 0. Explicitly leaving clears the hint.
 */
function rememberScore(code: string, uid: string, score: number) {
  try {
    sessionStorage.setItem(SS_SCORE(code, uid), String(Math.max(0, Math.floor(score))));
  } catch {
    // sessionStorage unavailable (private mode) — scores simply won't survive a reload.
  }
}

function readScoreHint(code: string, uid: string): number {
  try {
    const raw = sessionStorage.getItem(SS_SCORE(code, uid));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(MAX_SCORE, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}

function clearScoreHint(code: string, uid: string) {
  try {
    sessionStorage.removeItem(SS_SCORE(code, uid));
  } catch {
    // ignore
  }
}

export { MAX_PLAYERS, ROOM_TTL_MS } from './room-logic';
const HEARTBEAT_MS = 25_000;
const IDENTITY_TIMEOUT_MS = 12_000;

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown, bcName?: string) {
  localStorage.setItem(key, JSON.stringify(value));
  if (bcName && typeof BroadcastChannel !== 'undefined') {
    new BroadcastChannel(bcName).postMessage({ key, at: Date.now() });
  }
}

// Persist the chosen avatar under both its stable id and canonical color so a
// refresh / rejoin always rehydrates the exact same species.
function rememberIdentity(name: string, av: { avatarId: string; avatarColor: string }) {
  sessionStorage.setItem('roomcade:name', name);
  sessionStorage.setItem('roomcade:color', av.avatarColor);
  sessionStorage.setItem('roomcade:avatarId', av.avatarId);
}

// Heal legacy room state on read: fill in a stable avatarId from the stored color
// and snap the color back to the registry so unknown values never render another
// species. Deterministic: same input always yields the same serialized player.
function normalizePlayer(p: any): Player {
  const av = avatarFields(p?.avatarColor ?? p?.avatarId);
  return {
    uid: String(p?.uid ?? ''),
    name: cleanName(p?.name, 'Player'),
    ...av,
    score: Math.max(0, Number(p?.score) || 0),
    joinedAt: Number.isFinite(Number(p?.joinedAt)) ? Number(p?.joinedAt) : 0,
    lastSeen: Number.isFinite(Number(p?.lastSeen)) ? Number(p?.lastSeen) : 0,
    online: p?.online !== false,
  };
}

function localUid(): string {
  let uid = sessionStorage.getItem('roomcade:uid');
  if (!uid) {
    uid = `u_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('roomcade:uid', uid);
  }
  return uid;
}

let identityUid: string | null = null;
let identityPromise: Promise<string> | null = null;

/**
 * The canonical player id. In Firebase mode this is the anonymous auth uid, so
 * RTDB rules can bind writes to the caller. Synchronous reads are safe once the
 * root IdentityGate has resolved (it awaits ensureIdentity before rendering).
 */
export function getSessionUid(): string {
  if (identityUid) return identityUid;
  const authUid = currentAuthUid();
  if (authUid) {
    identityUid = authUid;
    sessionStorage.setItem('roomcade:uid', authUid);
    return authUid;
  }
  return localUid();
}

export async function ensureIdentity(): Promise<string> {
  if (identityUid) return identityUid;
  if (!firebaseConfigured()) return getSessionUid();
  if (!identityPromise) {
    identityPromise = (async () => {
      // If a previous attempt failed, clear the cached failure and retry once.
      const authFn = authFailureReason() ? retryAnonymousAuth : ensureAnonymousAuth;
      const uid = await Promise.race([
        authFn(),
        new Promise<string | null>((_, reject) =>
          setTimeout(() => reject(new Error('identity-timeout')), IDENTITY_TIMEOUT_MS)
        ),
      ]);
      if (uid) {
        identityUid = uid;
        sessionStorage.setItem('roomcade:uid', uid);
        return uid;
      }
      // Auth failed — clear the cached promise so the next call retries instead
      // of returning this stale local uid. createRoom/joinRoom will still throw
      // AUTH_REQUIRED because the RTDB write fails without a real auth uid.
      identityPromise = null;
      return localUid();
    })();
  }
  return identityPromise;
}

/** Test hook: drop the cached identity so a new simulated client can sign in. */
export function resetIdentityForTests(): void {
  identityUid = null;
  identityPromise = null;
}

function isStale(meta: RoomMeta): boolean {
  return roomIsStale(meta.players.length, meta.updatedAt);
}

function isPermissionDenied(e: unknown): boolean {
  const code = String((e as any)?.code ?? '');
  return code === 'PERMISSION_DENIED' || code === 'database/permission-denied';
}

/**
 * Non-fatal operator warning: anonymous auth is off, so the RTDB rules (which
 * require `auth != null`) cannot protect writes. Surfaced in the UI instead of
 * hard-failing, because a project with open rules still works today.
 */
export function firebaseAuthWarning(): string | null {
  if (!firebaseConfigured()) return null;
  return authFailureReason();
}

/**
 * Retry anonymous auth. Called by AuthWarning retry button. Clears the cached
 * identity promise so the next ensureIdentity() call will re-attempt sign-in.
 */
export async function retryAuth(): Promise<void> {
  identityUid = null;
  identityPromise = null;
  await ensureIdentity();
}

function normalizeRoomMeta(val: any): RoomMeta | null {
  if (!val) return null;
  let raw = val;
  if (typeof val === 'string') {
    try {
      raw = JSON.parse(val);
    } catch {
      return null;
    }
  }
  let players = raw.players;
  if (players && !Array.isArray(players) && typeof players === 'object') {
    players = Object.values(players);
  }
  return {
    code: String(raw.code || ''),
    hostId: String(raw.hostId || ''),
    status: raw.status || 'lobby',
    currentGameId: raw.currentGameId || null,
    selectedGameId: raw.selectedGameId || null,
    players: Array.isArray(players) ? players.map(normalizePlayer) : [],
    round: Number(raw.round) || 1,
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

// ---- Presence -------------------------------------------------------------

const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

function presenceKey(code: string, uid: string) {
  return `${code}:${uid}`;
}

async function writePresence(rtdb: Database, code: string, uid: string, name: string): Promise<void> {
  await set(ref(rtdb, `rooms/${code}/presence/${uid}`), { at: Date.now(), name: cleanName(name, 'Player') });
}

/**
 * Presence for *every* per-player node, not just the players list:
 *   - rooms/$code/meta/players/$uid  (leave the lounge / stop blocking a seat)
 *   - rooms/$code/presence/$uid      (per-player presence record)
 * Both are registered with onDisconnect so a closed tab or dropped network never
 * leaves a ghost. A heartbeat keeps lastSeen fresh for the ghost sweeper.
 */
async function registerPresence(rtdb: Database, code: string, uid: string, name: string): Promise<void> {
  const playerPath = `rooms/${code}/meta/players/${uid}`;
  const presencePath = `rooms/${code}/presence/${uid}`;
  try {
    await onDisconnect(ref(rtdb, playerPath)).remove();
    await onDisconnect(ref(rtdb, presencePath)).remove();
  } catch {
    // Rules may forbid onDisconnect in some environments; degrade gracefully.
  }
  await writePresence(rtdb, code, uid, name).catch(() => {});
  const key = presenceKey(code, uid);
  const old = heartbeatTimers.get(key);
  if (old) clearInterval(old);
  const timer = setInterval(() => {
    // Touch both per-player nodes so neither goes stale while the tab is open.
    void update(ref(rtdb, presencePath), { at: Date.now() }).catch(() => {});
    void update(ref(rtdb, playerPath), { lastSeen: Date.now() }).catch(() => {});
  }, HEARTBEAT_MS);
  heartbeatTimers.set(key, timer);
}

async function unregisterPresence(rtdb: Database, code: string, uid: string): Promise<void> {
  const key = presenceKey(code, uid);
  const timer = heartbeatTimers.get(key);
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(key);
  }
  try {
    await onDisconnect(ref(rtdb, `rooms/${code}/meta/players/${uid}`)).cancel();
    await onDisconnect(ref(rtdb, `rooms/${code}/presence/${uid}`)).cancel();
  } catch {
    // Best effort.
  }
}

/** Best-effort deletion of an abandoned room; rules allow it when it is empty. */
async function reapAbandonedRoom(rtdb: Database, code: string, meta: RoomMeta | null): Promise<boolean> {
  if (!meta) return false;
  if (!isStale(meta)) return false;
  try {
    await remove(ref(rtdb, `rooms/${code}`));
    return true;
  } catch {
    return false;
  }
}

const ROOM_CREATE_TIMEOUT_MS = 15_000;

export async function createRoom(name: string, avatarColor: string, initialGameId: string = 'sculptionary'): Promise<{ code: string; uid: string }> {
  const uid = await Promise.race([
    ensureIdentity(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('identity-timeout')), IDENTITY_TIMEOUT_MS)
    ),
  ]);
  const av = avatarFields(avatarColor);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCode(5);
    const now = Date.now();
    const displayName = cleanName(name, 'Host');
    const me: Player = { uid, name: displayName, ...av, score: 0, joinedAt: now, lastSeen: now, online: true };
    const meta: RoomMeta = {
      code,
      hostId: uid,
      status: 'lobby',
      currentGameId: null,
      selectedGameId: initialGameId || 'sculptionary',
      players: [me],
      round: 1,
      updatedAt: now,
    };
    if (firebaseConfigured()) {
      const fb = getFirebase()!;
      const metaRef = ref(fb.rtdb, `rooms/${code}/meta`);
      const existing = await get(metaRef);
      if (existing.exists()) {
        // Reclaim a stale/empty code instead of handing out ghosts. If the room
        // still has live players it is not ours to delete — pick another code.
        const reaped = await reapAbandonedRoom(fb.rtdb, code, normalizeRoomMeta(existing.val()));
        if (!reaped) continue;
      }
      try {
        // Room creation is a single multi-path write validated by rules: the
        // creator must be the host and the only player.
        await Promise.race([
          set(metaRef, { ...meta, players: { [uid]: me } }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('room-create-timeout')), ROOM_CREATE_TIMEOUT_MS)
          ),
        ]);
      } catch (e) {
        // A code collision is caught by the get() above; a denial here means the
        // write itself was rejected (almost always: rules require auth and
        // anonymous sign-in is disabled in the Firebase project).
        if (isPermissionDenied(e) && authFailureReason()) throw new Error('AUTH_REQUIRED');
        if ((e as Error).message === 'room-create-timeout') throw new Error('ROOM_CREATE_TIMEOUT');
        throw new Error('ROOM_CREATE_DENIED');
      }
      await registerPresence(fb.rtdb, code, uid, displayName);
      rememberIdentity(displayName, av);
      return { code, uid };
    }
    if (readLocal<RoomMeta>(LS_ROOM(code))) continue;
    writeLocal(LS_ROOM(code), meta, BC(code));
    rememberIdentity(displayName, av);
    return { code, uid };
  }
  throw new Error('ROOM_CODE_TAKEN');
}

const JOIN_ROOM_TIMEOUT_MS = 15_000;

function joinError(message: string): Error {
  return new Error(message);
}

export async function joinRoom(rawCode: string, name: string, avatarColor: string): Promise<string> {
  const code = normalizeCode(rawCode);
  const uid = await Promise.race([
    ensureIdentity(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('identity-timeout')), IDENTITY_TIMEOUT_MS)
    ),
  ]);
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const metaRef = ref(fb.rtdb, `rooms/${code}/meta`);
    try {
      const snap = await Promise.race([
        get(metaRef),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('join-room-timeout')), JOIN_ROOM_TIMEOUT_MS)
        ),
      ]);
      const meta = normalizeRoomMeta(snap.val());
      if (!meta) throw joinError('ROOM_NOT_FOUND');
      if (isStale(meta)) {
        await reapAbandonedRoom(fb.rtdb, code, meta);
        throw joinError('ROOM_NOT_FOUND');
      }
      // A recap is a finished night; don't resurrect it as a live room.
      if (meta.status === 'recap') throw joinError('ROOM_ENDED');

      const existing = meta.players.find((p) => p.uid === uid);
      if (!existing && meta.players.length >= MAX_PLAYERS) throw joinError('ROOM_FULL');

      const av = avatarFields(avatarColor);
      const fallback = `Guest-${uid.slice(-4)}`;
      const displayName = uniqueName(cleanName(name, fallback), meta.players.filter((p) => p.uid !== uid).map((p) => p.name));
      const now = Date.now();
      const player: Player = existing
        ? { ...existing, name: displayName, ...av, lastSeen: now, online: true, joinedAt: existing.joinedAt || now }
        : { uid, name: displayName, ...av, score: readScoreHint(code, uid), joinedAt: now, lastSeen: now, online: true };

      try {
        await Promise.race([
          set(ref(fb.rtdb, `rooms/${code}/meta/players/${uid}`), player),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('join-room-timeout')), JOIN_ROOM_TIMEOUT_MS)
          ),
        ]);
      } catch (e) {
        // The capacity limit is enforced atomically by RTDB validation at the
        // players node (numChildren <= 8), so a lost race surfaces as a denial.
        const after = normalizeRoomMeta((await get(metaRef)).val());
        if (after && !after.players.some((p) => p.uid === uid) && after.players.length >= MAX_PLAYERS) {
          throw joinError('ROOM_FULL');
        }
        if (isPermissionDenied(e)) {
          throw joinError(authFailureReason() ? 'AUTH_REQUIRED' : 'JOIN_DENIED');
        }
        if ((e as Error).message === 'join-room-timeout') throw joinError('JOIN_TIMEOUT');
        throw e;
      }
      await update(metaRef, { updatedAt: now }).catch(() => {});
      await registerPresence(fb.rtdb, code, uid, displayName);

      // Two clients picking the same display name at the same instant both see the
      // name as free; settle it with a second pass so the lounge never shows twins.
      const settled = normalizeRoomMeta((await get(metaRef)).val());
      if (settled) {
        const twins = settled.players.filter((p) => p.uid !== uid && p.name.toLowerCase() === displayName.toLowerCase());
        if (twins.length > 0) {
          const renamed = uniqueName(displayName, settled.players.filter((p) => p.uid !== uid).map((p) => p.name));
          await update(ref(fb.rtdb, `rooms/${code}/meta/players/${uid}`), { name: renamed }).catch(() => {});
          rememberIdentity(renamed, av);
          return uid;
        }
      }
      rememberIdentity(displayName, av);
      return uid;
    } catch (e) {
      if ((e as Error).message === 'join-room-timeout') throw joinError('JOIN_TIMEOUT');
      throw e;
    }
  }

  const meta = readLocal<RoomMeta>(LS_ROOM(code));
  if (!meta) throw joinError('ROOM_NOT_FOUND');
  if (meta.status === 'recap') throw joinError('ROOM_ENDED');
  if (meta.players.length >= MAX_PLAYERS && !meta.players.some((p) => p.uid === uid)) {
    throw joinError('ROOM_FULL');
  }
  const av = avatarFields(avatarColor);
  const displayName = uniqueName(cleanName(name, `Guest-${uid.slice(-4)}`), meta.players.filter((p) => p.uid !== uid).map((p) => p.name));
  const now = Date.now();
  const players: Player[] = meta.players.some((p) => p.uid === uid)
    ? meta.players.map((p) => (p.uid === uid ? { ...p, name: displayName, ...av, lastSeen: now, online: true } : p))
    : [...meta.players, { uid, name: displayName, ...av, score: readScoreHint(code, uid), joinedAt: now, lastSeen: now, online: true }];
  writeLocal(LS_ROOM(code), { ...meta, players, updatedAt: now }, BC(code));
  rememberIdentity(displayName, av);
  return uid;
}

/** Delete the room only if we were its last player; otherwise just remove ourselves. */
async function deleteRoomIfLastPlayer(rtdb: Database, code: string, uid: string): Promise<void> {
  try {
    await runTransaction(ref(rtdb, `rooms/${code}`), (cur) => {
      const players = cur?.meta?.players;
      const keys = players && typeof players === 'object' ? Object.keys(players) : [];
      if (keys.length === 0) return null;
      if (keys.length === 1 && keys[0] === uid) return null;
      return undefined; // another player is here — abort, we only remove ourselves
    });
  } catch {
    // Rules deny if we are not the last player; that is expected.
  }
}

// Explicit leave (page hide / back home). Removes this player's presence nodes and,
// when the room is now empty, deletes the whole room + its live game state so a
// finished night never leaks a stale room code. onDisconnect() covers hard drops.
export async function leaveRoom(rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode);
  const uid = await ensureIdentity();
  // An explicit leave ends this player's night: don't restore the old score if
  // they join a *new* room with the same code later.
  clearScoreHint(code, uid);
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    await unregisterPresence(fb.rtdb, code, uid);
    try {
      await deleteRoomIfLastPlayer(fb.rtdb, code, uid);
      await remove(ref(fb.rtdb, `rooms/${code}/meta/players/${uid}`));
      await remove(ref(fb.rtdb, `rooms/${code}/presence/${uid}`));
    } catch {
      // Best-effort: never block navigation on cleanup.
    }
    return;
  }
  const meta = readLocal<RoomMeta>(LS_ROOM(code));
  if (!meta) return;
  const players = meta.players.filter((p) => p.uid !== uid);
  if (players.length === 0) {
    localStorage.removeItem(LS_ROOM(code));
    localStorage.removeItem(LS_LIVE(code));
    if (typeof BroadcastChannel !== 'undefined') new BroadcastChannel(BC(code)).postMessage({ key: LS_ROOM(code), at: Date.now() });
    return;
  }
  writeLocal(LS_ROOM(code), { ...meta, players, updatedAt: Date.now() }, BC(code));
}

function parseLiveState(val: unknown): LiveState | null {
  if (!val) return null;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as LiveState;
    } catch {
      return null;
    }
  }
  return val as LiveState;
}

function serializeLiveState(state: LiveState | null): string | null {
  if (state === null) return null;
  return JSON.stringify(state);
}

// Local backend writes are serialized per room so two tabs can't clobber each
// other's read-modify-write during a burst (e.g. simultaneous buzzers).
const localChains = new Map<string, Promise<unknown>>();

function enqueueLocal<T>(key: string, fn: () => T): Promise<T> {
  const prev = localChains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  localChains.set(key, next.catch(() => {}));
  return next;
}

export function subscribeRoom(code: string, cb: (meta: RoomMeta | null) => void): () => void {
  const c = normalizeCode(code);
  if (firebaseConfigured()) {
    let cancelled = false;
    let unsub: Unsubscribe | null = null;
    // Auth first: subscribing before anonymous sign-in completes yields
    // PERMISSION_DENIED and the UI would wrongly render "room not found".
    void ensureIdentity().then(() => {
      if (cancelled) return;
      const fb = getFirebase()!;
      const r = ref(fb.rtdb, `rooms/${c}/meta`);
      unsub = onValue(
        r,
        (snap) => {
          const meta = snap.exists() ? normalizeRoomMeta(snap.val()) : null;
          if (meta) {
            const mine = meta.players.find((p) => p.uid === getSessionUid());
            if (mine) rememberScore(c, mine.uid, mine.score);
          }
          cb(meta);
        },
        () => {
          // Transient read failure (offline): leave the last good state on screen.
        },
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }
  const emit = () => {
    const meta = normalizeRoomMeta(readLocal<RoomMeta>(LS_ROOM(c)));
    const mine = meta?.players.find((p) => p.uid === getSessionUid());
    if (mine) rememberScore(c, mine.uid, mine.score);
    cb(meta);
  };
  emit();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_ROOM(c)) emit();
  };
  window.addEventListener('storage', onStorage);
  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(BC(c));
    bc.onmessage = () => emit();
  }
  // Same-tab updates don't fire storage events; poll lightly as a backstop.
  const timer = window.setInterval(emit, 1000);
  return () => {
    window.removeEventListener('storage', onStorage);
    bc?.close();
    window.clearInterval(timer);
  };
}

export type RoomPatch = Partial<Pick<RoomMeta, 'status' | 'currentGameId' | 'selectedGameId' | 'round'>>;

/**
 * Patch room meta. Host-only fields are dropped for non-hosts here *and* denied by
 * rules, so a guest can never flip the room phase or reassign the host.
 */
export async function patchRoom(code: string, patch: RoomPatch): Promise<void> {
  const c = normalizeCode(code);
  const uid = await ensureIdentity();
  const fields: RoomPatch = { ...patch };
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const metaRef = ref(fb.rtdb, `rooms/${c}/meta`);
    if ('status' in fields || 'currentGameId' in fields || 'selectedGameId' in fields || 'round' in fields) {
      const meta = normalizeRoomMeta((await get(metaRef)).val());
      if (!meta || meta.hostId !== uid) {
        delete fields.status;
        delete fields.currentGameId;
        delete fields.selectedGameId;
        delete fields.round;
      }
    }
    if (!Object.keys(fields).length) return;
    await update(metaRef, { ...fields, updatedAt: Date.now() });
    return;
  }
  const meta = readLocal<RoomMeta>(LS_ROOM(c));
  if (!meta) return;
  writeLocal(LS_ROOM(c), { ...meta, ...fields, updatedAt: Date.now() }, BC(c));
}

/** Host heartbeat — keeps an active room out of TTL cleanup. */
export async function touchRoom(code: string): Promise<void> {
  if (!firebaseConfigured()) return;
  const c = normalizeCode(code);
  const fb = getFirebase()!;
  const meta = normalizeRoomMeta((await get(ref(fb.rtdb, `rooms/${c}/meta`))).val());
  if (!meta || meta.hostId !== getSessionUid()) return;
  await update(ref(fb.rtdb, `rooms/${c}/meta`), { updatedAt: Date.now() }).catch(() => {});
}

/**
 * Host migration. If the recorded host is no longer a player (closed tab, dropped
 * network, explicit leave), the first remaining player to run this becomes host.
 * runTransaction on hostId means two clients racing produce exactly one host.
 */
export async function claimHostIfMissing(code: string, known?: RoomMeta | null): Promise<string | null> {
  const c = normalizeCode(code);
  const uid = await ensureIdentity();
  if (!firebaseConfigured()) {
    const meta = known ?? readLocal<RoomMeta>(LS_ROOM(c));
    if (!meta) return null;
    if (meta.players.some((p) => p.uid === meta.hostId)) return meta.hostId;
    const next = meta.players[0]?.uid ?? null;
    if (next && next !== uid) return next;
    if (next === uid) writeLocal(LS_ROOM(c), { ...meta, hostId: uid, updatedAt: Date.now() }, BC(c));
    return next;
  }
  const fb = getFirebase()!;
  const metaRef = ref(fb.rtdb, `rooms/${c}/meta`);
  const snap = known ? null : await get(metaRef);
  const meta = known ?? normalizeRoomMeta(snap?.val() ?? null);
  if (!meta) return null;
  if (!hostIsMissing(meta.hostId, meta.players)) return meta.hostId;
  if (!meta.players.some((p) => p.uid === uid)) return null;
  const hostRef = ref(fb.rtdb, `rooms/${c}/meta/hostId`);
  try {
    const result = await runTransaction(hostRef, (current) => {
      // Someone already migrated (or the original host came back) → leave it.
      if (current && meta.players.some((p) => p.uid === current)) return undefined;
      return uid;
    });
    return result.committed ? uid : (result.snapshot.val() as string | null);
  } catch {
    return null;
  }
}

/**
 * Remove players that stopped heartbeating while sitting in the lobby. Only the
 * host may delete another player's node (rules), and only in the lobby — never
 * mid-game where the game state still references them.
 */
export async function pruneGhosts(code: string, known?: RoomMeta | null): Promise<number> {
  const c = normalizeCode(code);
  if (!firebaseConfigured()) return 0;
  const uid = await ensureIdentity();
  const fb = getFirebase()!;
  const meta = known ?? normalizeRoomMeta((await get(ref(fb.rtdb, `rooms/${c}/meta`))).val());
  if (!meta || meta.hostId !== uid || meta.status !== 'lobby') return 0;
  const now = Date.now();
  const ghosts = meta.players.filter((p) => p.uid !== uid && isGhost(p.lastSeen, now, GHOST_AGE_MS));
  for (const p of ghosts) {
    await remove(ref(fb.rtdb, `rooms/${c}/meta/players/${p.uid}`)).catch(() => {});
    await remove(ref(fb.rtdb, `rooms/${c}/presence/${p.uid}`)).catch(() => {});
  }
  return ghosts.length;
}

export async function awardScores(code: string, awards: Record<string, number>): Promise<void> {
  const c = normalizeCode(code);
  const uid = await ensureIdentity();
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const r = ref(fb.rtdb, `rooms/${c}/meta`);
    const snap = await get(r);
    if (!snap.exists()) return;
    const meta = normalizeRoomMeta(snap.val());
    if (!meta) return;
    const isHost = meta.hostId === uid;
    // Additive, per-field update using explicit slash paths. Passing a nested
    // `players: { uid: {...} }` object to RTDB update() replaces the whole
    // `players` node and deletes every other player — so we only ever write the
    // single `score` field of the players being awarded.
    const updates: Record<string, number> = {};
    for (const p of meta.players) {
      const add = Math.floor(awards[p.uid] ?? 0);
      if (!add || add < 0) continue;
      // Rules only allow a client to raise its own score; the host adjudicates
      // group awards (werewolf, tag, sculptionary, truth-or-dare).
      if (!isHost && p.uid !== uid) continue;
      updates[`players/${p.uid}/score`] = Math.min(MAX_SCORE, p.score + add);
    }
    if (Object.keys(updates).length === 0) return;
    await update(r, { ...updates, updatedAt: Date.now() });
    return;
  }
  const meta = readLocal<RoomMeta>(LS_ROOM(c));
  if (!meta) return;
  const isHost = meta.hostId === uid;
  const players = meta.players.map((p) => {
    const add = Math.floor(awards[p.uid] ?? 0);
    if (!add || add < 0 || (!isHost && p.uid !== uid)) return p;
    return { ...p, score: Math.min(MAX_SCORE, p.score + add) };
  });
  writeLocal(LS_ROOM(c), { ...meta, players, updatedAt: Date.now() }, BC(c));
}

// ---- Live (ephemeral per-game) state ----

export function subscribeLive(code: string, cb: (s: LiveState | null) => void): () => void {
  const c = normalizeCode(code);
  if (firebaseConfigured()) {
    let cancelled = false;
    let unsub: Unsubscribe | null = null;
    void ensureIdentity().then(() => {
      if (cancelled) return;
      const fb = getFirebase()!;
      const r = ref(fb.rtdb, `rooms/${c}/live`);
      unsub = onValue(
        r,
        (snap) => cb(snap.exists() ? parseLiveState(snap.val()) : null),
        () => {
          // Keep the last known state on transient failures.
        },
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }
  const emit = () => cb(readLocal<LiveState>(LS_LIVE(c)));
  emit();
  const onStorage = (e: StorageEvent) => {
    if (e.key === LS_LIVE(c)) emit();
  };
  window.addEventListener('storage', onStorage);
  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(BC(c) + ':live');
    bc.onmessage = () => emit();
  }
  const timer = window.setInterval(emit, 250);
  return () => {
    window.removeEventListener('storage', onStorage);
    bc?.close();
    window.clearInterval(timer);
  };
}

export async function setLive(code: string, state: LiveState | null): Promise<void> {
  const c = normalizeCode(code);
  await ensureIdentity();
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const r = ref(fb.rtdb, `rooms/${c}/live`);
    if (state === null) {
      await remove(r);
    } else {
      await set(r, serializeLiveState(state));
    }
    return;
  }
  if (state === null) {
    localStorage.removeItem(LS_LIVE(c));
    if (typeof BroadcastChannel !== 'undefined') new BroadcastChannel(BC(c) + ':live').postMessage({ cleared: true });
    return;
  }
  writeLocal(LS_LIVE(c), state, BC(c) + ':live');
}

/**
 * Seed the shared game state exactly once when a game starts. Two clients
 * entering the play route simultaneously would otherwise each write their own
 * initial state (random werewolf roles / random "it" in tag); the transaction
 * guarantees the room agrees on one.
 */
export async function ensureLiveInitialized(code: string, makeState: () => LiveState): Promise<void> {
  const c = normalizeCode(code);
  await ensureIdentity();
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    await runTransaction(ref(fb.rtdb, `rooms/${c}/live`), (current) => {
      if (current != null && current !== '') return undefined; // already seeded
      return serializeLiveState(makeState());
    });
    return;
  }
  await enqueueLocal(`live:${c}`, () => {
    if (readLocal<LiveState>(LS_LIVE(c))) return;
    writeLocal(LS_LIVE(c), makeState(), BC(c) + ':live');
  });
}

/**
 * Apply a game action atomically. The previous implementation read → applied →
 * wrote, so simultaneous actions (two buzzers, two taps) lost one update.
 */
export async function dispatchLive(
  code: string,
  action: Action,
  apply: (state: LiveState, action: Action) => LiveState,
  init: () => LiveState,
): Promise<void> {
  const c = normalizeCode(code);
  await ensureIdentity();
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const r = ref(fb.rtdb, `rooms/${c}/live`);
    await runTransaction(r, (current) => {
      const cur = parseLiveState(current) ?? init();
      return serializeLiveState(apply(cur, action));
    });
    return;
  }
  await enqueueLocal(`live:${c}`, () => {
    const cur = readLocal<LiveState>(LS_LIVE(c)) ?? init();
    writeLocal(LS_LIVE(c), apply(cur, action), BC(c) + ':live');
  });
}
