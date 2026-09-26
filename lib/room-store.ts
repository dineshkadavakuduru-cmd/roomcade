'use client';

/**
 * Room store: Realtime Database (RTDB) for room metadata + live state when Firebase
 * is configured; otherwise a local same-origin backend (localStorage +
 * BroadcastChannel) so two tabs on one machine can complete the full
 * create → join → play flow with zero setup.
 */
import { generateCode, normalizeCode, type Action, type LiveState, type Player, type RoomMeta } from './types';
import { firebaseConfigured, getFirebase } from './firebase';
import { get, onValue, ref, remove, set, update, type Unsubscribe } from 'firebase/database';

const LS_ROOM = (code: string) => `roomcade:room:${code}`;
const LS_LIVE = (code: string) => `roomcade:live:${code}`;
const BC = (code: string) => `roomcade-bc-${code}`;

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

export function getSessionUid(): string {
  let uid = sessionStorage.getItem('roomcade:uid');
  if (!uid) {
    uid = `u_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('roomcade:uid', uid);
  }
  return uid;
}

export async function createRoom(name: string, avatarColor: string): Promise<{ code: string; uid: string }> {
  const uid = getSessionUid();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(5);
    const meta: RoomMeta = {
      code,
      hostId: uid,
      status: 'lobby',
      currentGameId: null,
      players: [{ uid, name: name || 'Host', avatarColor, score: 0 }],
      round: 1,
      updatedAt: Date.now(),
    };
    if (firebaseConfigured()) {
      const fb = getFirebase()!;
      const r = ref(fb.rtdb, `rooms/${code}/meta`);
      const existing = await get(r);
      if (existing.exists()) continue;
      await set(r, meta);
      sessionStorage.setItem('roomcade:name', name);
      sessionStorage.setItem('roomcade:color', avatarColor);
      return { code, uid };
    }
    if (readLocal<RoomMeta>(LS_ROOM(code))) continue;
    writeLocal(LS_ROOM(code), meta, BC(code));
    sessionStorage.setItem('roomcade:name', name);
    sessionStorage.setItem('roomcade:color', avatarColor);
    return { code, uid };
  }
  throw new Error('Could not allocate a room code, try again.');
}

export async function joinRoom(rawCode: string, name: string, avatarColor: string): Promise<string> {
  const code = normalizeCode(rawCode);
  const uid = getSessionUid();
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const r = ref(fb.rtdb, `rooms/${code}/meta`);
    const snap = await get(r);
    const meta = normalizeRoomMeta(snap.val());
    if (!meta) throw new Error('Room not found. Check the code.');
    if (meta.players.length >= 8) throw new Error('Room is full (8 max).');
    const players = meta.players.some((p) => p.uid === uid)
      ? meta.players.map((p) => (p.uid === uid ? { ...p, name, avatarColor } : p))
      : [...meta.players, { uid, name, avatarColor, score: 0 }];
    await update(r, { players, updatedAt: Date.now() });
    sessionStorage.setItem('roomcade:name', name);
    sessionStorage.setItem('roomcade:color', avatarColor);
    return uid;
  }
  const meta = readLocal<RoomMeta>(LS_ROOM(code));
  if (!meta) throw new Error('Room not found. Check the code.');
  if (meta.players.length >= 8 && !meta.players.some((p) => p.uid === uid)) {
    throw new Error('Room is full (8 max).');
  }
  const players: Player[] = meta.players.some((p) => p.uid === uid)
    ? meta.players.map((p) => (p.uid === uid ? { ...p, name, avatarColor } : p))
    : [...meta.players, { uid, name: name || `Guest-${uid.slice(2, 6)}`, avatarColor, score: 0 }];
  writeLocal(LS_ROOM(code), { ...meta, players, updatedAt: Date.now() }, BC(code));
  sessionStorage.setItem('roomcade:name', name);
  sessionStorage.setItem('roomcade:color', avatarColor);
  return uid;
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
    players: Array.isArray(players) ? players : [],
    round: Number(raw.round) || 1,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
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

export function subscribeRoom(code: string, cb: (meta: RoomMeta | null) => void): () => void {
  const c = normalizeCode(code);
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const r = ref(fb.rtdb, `rooms/${c}/meta`);
    return onValue(r, (snap) => {
      cb(snap.exists() ? normalizeRoomMeta(snap.val()) : null);
    });
  }
  const emit = () => cb(normalizeRoomMeta(readLocal<RoomMeta>(LS_ROOM(c))));
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

export async function patchRoom(code: string, patch: Partial<RoomMeta>): Promise<void> {
  const c = normalizeCode(code);
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    await update(ref(fb.rtdb, `rooms/${c}/meta`), { ...patch, updatedAt: Date.now() });
    return;
  }
  const meta = readLocal<RoomMeta>(LS_ROOM(c));
  if (!meta) return;
  writeLocal(LS_ROOM(c), { ...meta, ...patch, updatedAt: Date.now() }, BC(c));
}

export async function awardScores(code: string, awards: Record<string, number>): Promise<void> {
  const c = normalizeCode(code);
  if (firebaseConfigured()) {
    const fb = getFirebase()!;
    const r = ref(fb.rtdb, `rooms/${c}/meta`);
    const snap = await get(r);
    if (!snap.exists()) return;
    const meta = normalizeRoomMeta(snap.val());
    if (!meta) return;
    const players = meta.players.map((p) => ({ ...p, score: p.score + (awards[p.uid] ?? 0) }));
    await update(r, { players, updatedAt: Date.now() });
    return;
  }
  const meta = readLocal<RoomMeta>(LS_ROOM(c));
  if (!meta) return;
  const players = meta.players.map((p) => ({ ...p, score: p.score + (awards[p.uid] ?? 0) }));
  writeLocal(LS_ROOM(c), { ...meta, players, updatedAt: Date.now() }, BC(c));
}

// ---- Live (ephemeral per-game) state ----

export function subscribeLive(code: string, cb: (s: LiveState | null) => void): () => void {
  const c = normalizeCode(code);
  const fb = firebaseConfigured() ? getFirebase() : null;
  if (fb?.rtdb) {
    const r = ref(fb.rtdb, `rooms/${c}/live`);
    const unsub: Unsubscribe = onValue(r, (snap) => cb(snap.exists() ? parseLiveState(snap.val()) : null));
    return unsub;
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
  const fb = firebaseConfigured() ? getFirebase() : null;
  if (fb?.rtdb) {
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

export async function dispatchLive(
  code: string,
  action: Action,
  apply: (state: LiveState, action: Action) => LiveState,
  init: () => LiveState,
): Promise<void> {
  const c = normalizeCode(code);
  const fb = firebaseConfigured() ? getFirebase() : null;
  if (fb?.rtdb) {
    const r = ref(fb.rtdb, `rooms/${c}/live`);
    const snap = await get(r);
    const cur = snap.exists() ? (parseLiveState(snap.val()) ?? init()) : init();
    const next = apply(cur, action);
    const serialized = serializeLiveState(next);
    if (serialized === null) {
      await remove(r);
    } else {
      await set(r, serialized);
    }
    return;
  }
  const cur = readLocal<LiveState>(LS_LIVE(c)) ?? init();
  writeLocal(LS_LIVE(c), apply(cur, action), BC(c) + ':live');
}
